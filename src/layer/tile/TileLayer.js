const workerCode = `
self.onmessage = async function(e) {
  const data = e.data;
  const { command, requestId } = data;

  if (command === 'computeURL') {
    const { coords, options, retina, globalTileRange, mapOptions } = data;
    try {
      let z = coords.z;
      if (options.zoomReverse) {
        z = options.maxZoom - z;
      }
      const zoom = z + (options.zoomOffset || 0);
      const tileData = {
        r: retina ? '@2x' : '',
        s: getSubdomain(coords, options.subdomains),
        x: coords.x,
        y: coords.y,
        z: zoom
      };

      if (!mapOptions.infinite) {
        const invertedY = globalTileRange.max.y - coords.y;
        if (options.tms) {
          tileData.y = invertedY;
        }
        tileData['-y'] = invertedY;
      }
      const tileUrl = template(options.url, { ...options, ...tileData });
      postMessage({
        command: 'computeURL',
        requestId,
        tileUrl
      });
    } catch (err) {
      postMessage({
        command: 'computeURL',
        requestId
      });
    }
  }
  else if (command === 'renderTile') {
    try {
      const { tileBlob, tileSize } = data;
      if (typeof OffscreenCanvas === 'undefined') {
        postMessage({
          command: 'renderTile',
          requestId,
          fallbackBlob: tileBlob
        });
        return;
      }
      const offscreen = new OffscreenCanvas(tileSize, tileSize);
      const ctx = offscreen.getContext('2d');
      const tileBitmap = await createImageBitmap(tileBlob);
      ctx.drawImage(tileBitmap, 0, 0, tileSize, tileSize);
      const finalBitmap = offscreen.transferToImageBitmap();
      postMessage({
        command: 'renderTile',
        requestId,
        tileImageBitmap: finalBitmap
      }, [finalBitmap]);
    } catch (err) {
      postMessage({
        command: 'renderTile',
        requestId
      });
    }
  }
};

function getSubdomain(coords, subdomains) {
  const index = Math.abs(coords.x + coords.y) % subdomains.length;
  return subdomains[index];
}
function template(str, data) {
  return str.replace(/{ *([\\w_-]+) *}/g, function (match, key) {
    return data[key] !== undefined ? data[key] : '';
  });
}
`;

const tileWorkerBlob = new Blob([workerCode], { type: 'text/javascript' });
const tileWorkerUrl = URL.createObjectURL(tileWorkerBlob);
class WorkerPool {
  constructor(poolSize) {
    this.poolSize = poolSize;
    this.workers = [];
    this.nextWorkerIndex = 0;
    this.callbacks = {};
    this.requestId = 0;

    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(tileWorkerUrl);
      worker.onmessage = (e) => {
        const { command, requestId, error } = e.data;
        const cb = this.callbacks[requestId];
        if (!cb) return;
        if (command === 'computeURL') {
          const { tileUrl } = e.data;
          delete this.callbacks[requestId];
          if (error) {
            cb.reject(new Error(error));
          } else {
            cb.resolve({ tileUrl });
          }
        }
        else if (command === 'renderTile') {
          const { tileImageBitmap, fallbackBlob } = e.data;
          delete this.callbacks[requestId];
          if (error) {
            cb.reject(new Error(error));
          } else {
            cb.resolve({ tileImageBitmap, fallbackBlob });
          }
        }
      };
      this.workers.push(worker);
    }
  }

  postTask(taskData) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      this.callbacks[id] = { resolve, reject };
      taskData.requestId = id;
      const worker = this.workers[this.nextWorkerIndex];
      this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.poolSize;
      worker.postMessage(taskData);
    });
  }

  terminate() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
  }
}

import { GridLayer } from './GridLayer.js';
import Browser from '../../core/Browser.js';
import * as Util from '../../core/Util.js';

export const TileLayer = GridLayer.extend({
  options: {
    minZoom: 0,
    maxZoom: 18,
    subdomains: 'abc',
    errorTileUrl: '',
    tms: false,
    zoomReverse: false,
    detectRetina: false,
    crossOrigin: false,
    referrerPolicy: false,
    workerPoolMax: 4,
    tileSize: 256
  },
  _getWorkerPool() {
    if (!TileLayer._workerPool) {
      const cpuCount = navigator.hardwareConcurrency || 2;
      const poolSize = Math.min(cpuCount, this.options.workerPoolMax || 4);
      TileLayer._workerPool = new WorkerPool(poolSize);
    }
    return TileLayer._workerPool;
  },

  initialize(url, options) {
    this._url = url;
    options = Util.setOptions(this, options);
    if (options.detectRetina && Browser.retina && options.maxZoom > 0) {
      options.tileSize = Math.floor(options.tileSize / 2);
      if (!options.zoomReverse) {
        options.zoomOffset++;
        options.maxZoom = Math.max(options.minZoom, options.maxZoom - 1);
      } else {
        options.zoomOffset--;
        options.minZoom = Math.min(options.maxZoom, options.minZoom + 1);
      }
      options.minZoom = Math.max(0, options.minZoom);
    }

    if (typeof options.subdomains === 'string') {
      options.subdomains = options.subdomains.split('');
    }

    this.on('tileunload', this._onTileRemove);
  },

  createTile(coords, done) {
    const tileSize = this.options.tileSize;
    const canvas = document.createElement('canvas');
    canvas.width = tileSize;
    canvas.height = tileSize;
    canvas.style.position = 'absolute';
    canvas.style.zIndex = '0';
    canvas.style.opacity = '0';
    this._getWorkerPool().postTask({
      command: 'computeURL',
      coords,
      options: {
        url: this._url,
        tms: this.options.tms,
        subdomains: this.options.subdomains,
        zoomReverse: this.options.zoomReverse,
        zoomOffset: this.options.zoomOffset || 0,
        maxZoom: this.options.maxZoom
      },
      retina: Browser.retina,
      globalTileRange: this._globalTileRange || { max: { y: 0 } },
      mapOptions: {
        infinite: this._map?.options?.crs?.infinite ?? false
      }
    })
    .then(({ tileUrl }) => {
      return fetch(tileUrl, { credentials: 'same-origin' })
        .then(response => {
          if (!response.ok) {
          }
          return response.blob();
        });
    })
    .then(blob => {
      return this._getWorkerPool().postTask({
        command: 'renderTile',
        tileBlob: blob,
        tileSize
      });
    })
    .then(({ tileImageBitmap, fallbackBlob }) => {
      if (tileImageBitmap) {
        const ctxBitmap = canvas.getContext('bitmaprenderer');
        if (ctxBitmap) {
          ctxBitmap.transferFromImageBitmap(tileImageBitmap);
        } else {
          const ctx2d = canvas.getContext('2d');
          ctx2d.clearRect(0, 0, tileSize, tileSize);
          ctx2d.drawImage(tileImageBitmap, 0, 0, tileSize, tileSize);
        }
      } else if (fallbackBlob) {
        return createImageBitmap(fallbackBlob).then(imgBitmap => {
          const ctx2d = canvas.getContext('2d');
          ctx2d.clearRect(0, 0, tileSize, tileSize);
          ctx2d.drawImage(imgBitmap, 0, 0, tileSize, tileSize);
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
    .catch((err) => {
      const errorUrl = this.options.errorTileUrl;
      if (errorUrl) {
        const img = new Image();
        img.onload = () => {
          const ctx2d = canvas.getContext('2d');
          ctx2d.clearRect(0, 0, tileSize, tileSize);
          ctx2d.drawImage(img, 0, 0, tileSize, tileSize);
          done(null, canvas);
        };
        img.onerror = () => done(err, canvas);
        img.src = errorUrl;
      } else {
        done(err, canvas);
      }
    });
    return canvas;
  },
  setUrl(url, noRedraw) {
    if (this._url === url && noRedraw === undefined) {
      noRedraw = true;
    }
    this._url = url;
    if (!noRedraw) {
      this.redraw();
    }
    return this;
  },
  _onTileRemove(e) {
    e.tile.onload = null;
  }
});
export function tileLayer(url, options) {
  return new TileLayer(url, options);
}
