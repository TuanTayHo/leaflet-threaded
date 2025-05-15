function getWorkerScript() {
  return `
    self.onmessage = async function(e) {
      const { command, tileBlob, tileSize, requestId } = e.data;
      if (command === 'renderTile') {
        if (typeof OffscreenCanvas === 'undefined') {
          postMessage({ command, requestId, fallbackBlob: tileBlob });
          return;
        }
        const bitmap = await createImageBitmap(tileBlob);
        const canvas = new OffscreenCanvas(tileSize, tileSize);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const result = canvas.transferToImageBitmap();
        postMessage({ command, requestId, tileImageBitmap: result }, [result]);
      }
    };
  `;
}

class WorkerPool {
  constructor(poolSize) {
    this.workers = [];
    this.requestId = 0;
    this.callbacks = {};
    this.next = 0;

    const blob = new Blob([getWorkerScript()], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(url);
      worker.onmessage = (e) => {
        const { command, requestId, ...payload } = e.data;
        const cb = this.callbacks[requestId];
        if (cb) {
          delete this.callbacks[requestId];
          cb.resolve(payload);
        }
      };
      this.workers.push(worker);
    }
  }

  postTask(data) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      this.callbacks[id] = { resolve, reject };
      const worker = this.workers[this.next];
      this.next = (this.next + 1) % this.workers.length;
      worker.postMessage({ ...data, requestId: id });
    });
  }
}

(function (L) {
  L.TileLayer.Viqy = L.TileLayer.extend({
    options: {
      minNativeZoom: 0,
      timeout: null,
      doubleSize: false,
      useBingMaps: false,
      bingMapsKey: null,
      maxZoom: 22,
      minZoom: 0,
      workerPoolMax: 4,
      detectRetina: true,
      errorTileUrl: ''
    },

    initialize: function (url, options) {
      L.TileLayer.prototype.initialize.call(this, url, options);
      this._quadKeyCache = {};
    },

    getTileUrl: function (coords) {
      if (this.options.useBingMaps) {
        const key = `${coords.x}_${coords.y}_${coords.z}`;
        let quadKey = this._quadKeyCache[key];
        if (!quadKey) {
          quadKey = this._toQuadKey(coords.x, coords.y, coords.z);
          this._quadKeyCache[key] = quadKey;
        }
        return `https://ecn.t${(coords.x + coords.y) % 8}.tiles.virtualearth.net/tiles/a${quadKey}.jpeg?g=1&mkt=en-US&n=z&key=${this.options.bingMapsKey}`;
      }

      const zoom = this._getZoomForUrl(coords.z);
      const data = {
        r: this.options.detectRetina && L.Browser.retina ? '@2x' : '',
        s: this._getSubdomain(coords),
        x: coords.x,
        y: coords.y,
        z: zoom
      };

      if (this.options.tms && this._globalTileRange) {
        data.y = this._globalTileRange.max.y - coords.y;
        data['-y'] = this._globalTileRange.max.y - coords.y;
      }

      return L.Util.template(this._url, L.extend(data, this.options));
    },

    _getSubdomain: function (coords) {
      const subdomains = this.options.subdomains || ['a', 'b', 'c'];
      const index = Math.abs(coords.x + coords.y) % subdomains.length;
      return subdomains[index];
    },

    _getZoomForUrl: function (z) {
      let zoom = z;
      if (this.options.zoomReverse) {
        zoom = this.options.maxZoom - z;
      }
      return zoom + (this.options.zoomOffset || 0);
    },

    _toQuadKey: function (x, y, z) {
      let quadKey = '';
      for (let i = z; i > 0; i--) {
        let digit = 0;
        const mask = 1 << (i - 1);
        if ((x & mask) !== 0) digit++;
        if ((y & mask) !== 0) digit += 2;
        quadKey += digit;
      }
      return quadKey;
    },

    _getWorkerPool: function () {
      if (!L.TileLayer.Viqy._workerPool) {
        const cpuCount = navigator.hardwareConcurrency || 2;
        const poolSize = Math.min(cpuCount, this.options.workerPoolMax || 4);
        L.TileLayer.Viqy._workerPool = new WorkerPool(poolSize);
      }
      return L.TileLayer.Viqy._workerPool;
    },

    createTile: function (coords, done) {
      const tileSize = this.options.tileSize || 256;
      const url = this.getTileUrl(coords);

      const fallbackImg = () => {
        const img = document.createElement('img');
        img.classList.add('leaflet-tile');
        img.onload = () => done(null, img);
        img.onerror = () => {
          if (this.options.errorTileUrl) img.src = this.options.errorTileUrl;
          done(new Error('Tile fallback load error'), img);
        };
        img.src = url;
        return img;
      };

      // Trường hợp bắt buộc dùng <img>: Bing hoặc tile floodmap.net
      if (
        this.options.useBingMaps ||
        url.includes('floodmap.net/getFMTile.ashx')
      ) {
        return fallbackImg();
      }

      // Dùng canvas + WorkerPool để render tile
      const canvas = document.createElement('canvas');
      canvas.width = tileSize;
      canvas.height = tileSize;
      canvas.style.position = 'absolute';
      canvas.style.opacity = '0';

      fetch(url, { mode: 'cors', credentials: 'same-origin' })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then(blob => this._getWorkerPool().postTask({
          command: 'renderTile',
          tileBlob: blob,
          tileSize: tileSize
        }))
        .then(({ tileImageBitmap, fallbackBlob }) => {
          const ctx = canvas.getContext('bitmaprenderer') || canvas.getContext('2d');
          if (tileImageBitmap && ctx.transferFromImageBitmap) {
            ctx.transferFromImageBitmap(tileImageBitmap);
          } else {
            return createImageBitmap(fallbackBlob).then(bitmap => {
              ctx.clearRect(0, 0, tileSize, tileSize);
              ctx.drawImage(bitmap, 0, 0, tileSize, tileSize);
            });
          }
        })
        .then(() => {
          requestAnimationFrame(() => {
            canvas.style.transition = 'opacity 0.5s ease';
            canvas.style.opacity = '1';
          });
          done(null, canvas);
        })
        .catch(err => {
          console.warn('Tile render failed, falling back to image tag:', err);
          done(err, fallbackImg());
        });

      return canvas;
    }
  });

  L.tileLayer.viqy = function (url, options) {
    return new L.TileLayer.Viqy(url, options);
  };
})(L);
