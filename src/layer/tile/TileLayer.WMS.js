import { GridLayer } from './GridLayer.js';
import { extend, setOptions, getParamString } from '../../core/Util.js';
import Browser from '../../core/Browser.js';
import { EPSG4326 } from '../../geo/crs/CRS.EPSG4326.js';
import { toBounds } from '../../geometry/Bounds.js';

export const TileLayerWMS = GridLayer.extend({
  defaultWmsParams: {
    service: 'WMS',
    request: 'GetMap',
    layers: '',
    styles: '',
    format: 'image/jpeg',
    transparent: false,
    version: '1.1.1'
  },

  options: {
    crs: null,
    uppercase: false,
    detectRetina: false,
    crossOrigin: false
  },

  initialize(url, options) {
    this._url = url;

    const wmsParams = extend({}, this.defaultWmsParams);
    for (const key in options) {
      if (!(key in this.options)) {
        wmsParams[key] = options[key];
      }
    }

    options = setOptions(this, options);

    const realRetina = options.detectRetina && Browser.retina ? 2 : 1;
    const tileSize = this.getTileSize();
    wmsParams.width = tileSize.x * realRetina;
    wmsParams.height = tileSize.y * realRetina;

    this.wmsParams = wmsParams;
    this._tileCache = {};
  },

  onAdd(map) {
    this._map = map;
    this._crs = this.options.crs || map.options.crs;
    this._wmsVersion = parseFloat(this.wmsParams.version);
    const projectionKey = this._wmsVersion >= 1.3 ? 'crs' : 'srs';
    this.wmsParams[projectionKey] = this._crs.code;

    if (window.Worker && !this._worker) {
      const workerCode = `
        function _tileCoordsToNwSe(coords, tileSize) {
          return [
            { x: coords.x * tileSize.x, y: coords.y * tileSize.y },
            { x: (coords.x + 1) * tileSize.x, y: (coords.y + 1) * tileSize.y }
          ];
        }
        function project(p) {
          return p;
        }
        function toBounds(p1, p2) {
          return {
            min: { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y) },
            max: { x: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y) }
          };
        }
        function computeBBox(coords, tileSize, wmsVersion, isEPSG4326) {
          const tileBounds = _tileCoordsToNwSe(coords, tileSize);
          const nw = project(tileBounds[0]);
          const se = project(tileBounds[1]);
          const bounds = toBounds(nw, se);
          const min = bounds.min;
          const max = bounds.max;
          return (wmsVersion >= 1.3 && isEPSG4326) ?
            [min.y, min.x, max.y, max.x].join(',') :
            [min.x, min.y, max.x, max.y].join(',');
        }
        self.addEventListener('message', function(e) {
          const data = e.data;
          const resultBBox = computeBBox(
            data.tileCoords,
            data.tileSize,
            data.wmsVersion,
            data.isEPSG4326
          );
          self.postMessage({ id: data.id, bbox: resultBBox });
        });
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const blobURL = URL.createObjectURL(blob);
      this._worker = new Worker(blobURL);
      this._worker.onmessage = (e) => {
        const { id, bbox } = e.data;
        this._tileCache[id] = bbox;
      };
    }

    if (GridLayer.prototype.onAdd) {
      GridLayer.prototype.onAdd.call(this, map);
    }
  },

  createTile(coords, done) {
	const tileSize = this.getTileSize();
	const url = this.getTileUrl(coords);
	const image = new Image();
  
	if (this.options.crossOrigin) {
	  image.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
	}
  
	// Canvas được trả về cho Leaflet
	const canvas = document.createElement('canvas');
	canvas.width = tileSize.x;
	canvas.height = tileSize.y;
  
	image.onload = () => {
	  try {
		const ctx = canvas.getContext('2d');
  
		// Nếu hỗ trợ OffscreenCanvas, dùng tạm để vẽ – không chuyển Bitmap/Blob
		if (typeof OffscreenCanvas !== 'undefined') {
		  try {
			const offCanvas = new OffscreenCanvas(tileSize.x, tileSize.y);
			const offCtx = offCanvas.getContext('2d');
			offCtx.drawImage(image, 0, 0, tileSize.x, tileSize.y);
  
			// Sau đó vẽ từ offscreen → canvas chính luôn (tránh convertToBlob)
			const transferCanvas = document.createElement('canvas');
			transferCanvas.width = tileSize.x;
			transferCanvas.height = tileSize.y;
			const transferCtx = transferCanvas.getContext('2d');
			transferCtx.drawImage(offCanvas, 0, 0);
			ctx.drawImage(transferCanvas, 0, 0);
		  } catch (e) {
			console.warn('OffscreenCanvas draw failed, fallback to direct:', e);
			ctx.drawImage(image, 0, 0);
		  }
		} else {
		  ctx.drawImage(image, 0, 0);
		}
  
		done(null, canvas);
	  } catch (err) {
		done(err, canvas);
	  }
	};
  
	image.onerror = (err) => {
	  done(err, canvas);
	};
  
	image.src = url;
  
	return canvas;
  },  

  getTileUrl(coords) {
    const tileSize = this.getTileSize();
    const crs = this._crs;
    const tileKey = `${coords.x}_${coords.y}_${coords.z}`;
    let bbox;

    const messageId = 'tile_' + tileKey;

    if (this._worker && this._tileCache && this._tileCache[messageId]) {
      bbox = this._tileCache[messageId];
    } else if (this._worker) {
      this._worker.postMessage({
        id: messageId,
        tileCoords: { x: coords.x, y: coords.y, z: coords.z },
        tileSize: { x: tileSize.x, y: tileSize.y },
        wmsVersion: parseFloat(this.wmsParams.version),
        isEPSG4326: (crs.code === 'EPSG:4326')
      });

      const tileBounds = this._tileCoordsToNwSe(coords);
      const projected1 = crs.project(tileBounds[0]);
      const projected2 = crs.project(tileBounds[1]);
      const bounds = toBounds(projected1, projected2);
      const { min, max } = bounds;
      bbox = (parseFloat(this.wmsParams.version) >= 1.3 && (crs.code === 'EPSG:4326')) ?
        [min.y, min.x, max.y, max.x].join(',') :
        [min.x, min.y, max.x, max.y].join(',');
    } else {
      const tileBounds = this._tileCoordsToNwSe(coords);
      const projected1 = crs.project(tileBounds[0]);
      const projected2 = crs.project(tileBounds[1]);
      const bounds = toBounds(projected1, projected2);
      const { min, max } = bounds;
      bbox = (parseFloat(this.wmsParams.version) >= 1.3 && (crs.code === 'EPSG:4326')) ?
        [min.y, min.x, max.y, max.x].join(',') :
        [min.x, min.y, max.x, max.y].join(',');
    }

    let baseUrl = this._url;
    baseUrl = baseUrl
      .replace('{x}', coords.x)
      .replace('{y}', coords.y)
      .replace('{z}', coords.z);

    return baseUrl +
      getParamString(this.wmsParams, baseUrl, this.options.uppercase) +
      (this.options.uppercase ? '&BBOX=' : '&bbox=') + bbox;
  },

  setParams(params, noRedraw) {
    extend(this.wmsParams, params);
    if (!noRedraw && typeof this.redraw === 'function') {
      this.redraw();
    }
    return this;
  },

  onRemove(map) {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
      this._tileCache = {};
    }

    if (GridLayer.prototype.onRemove) {
      GridLayer.prototype.onRemove.call(this, map);
    }
  },

  _tileCoordsToNwSe(coords) {
    const tileSize = this.getTileSize();
    const nwPoint = { x: coords.x * tileSize.x, y: coords.y * tileSize.y };
    const sePoint = { x: (coords.x + 1) * tileSize.x, y: (coords.y + 1) * tileSize.y };
    const nw = this._map.unproject(nwPoint, coords.z);
    const se = this._map.unproject(sePoint, coords.z);
    return [nw, se];
  }
});

export function tileLayerWMS(url, options) {
  return new TileLayerWMS(url, options);
}
