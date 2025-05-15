import {Layer} from '../Layer.js';
import Browser from '../../core/Browser.js';
import * as Util from '../../core/Util.js';
import * as DomUtil from '../../dom/DomUtil.js';
import {Point} from '../../geometry/Point.js';
import {Bounds} from '../../geometry/Bounds.js';
import {LatLngBounds, toLatLngBounds as latLngBounds} from '../../geo/LatLngBounds.js';
const workerCode = `
  function computeTileRange(pixelBounds, tileSize) {
    return {
      min: {
        x: Math.floor(pixelBounds.min.x / tileSize.x),
        y: Math.floor(pixelBounds.min.y / tileSize.y)
      },
      max: {
        x: Math.ceil(pixelBounds.max.x / tileSize.x) - 1,
        y: Math.ceil(pixelBounds.max.y / tileSize.y) - 1
      }
    };
  }
  
  function sortTiles(tiles, centerTile) {
    return tiles.sort(function(a, b) {
      const da = Math.hypot(a.x - centerTile.x, a.y - centerTile.y);
      const db = Math.hypot(b.x - centerTile.x, b.y - centerTile.y);
      return da - db;
    });
  }
  function getTilePos(coords, tileSize, origin) {
    return {
      x: coords.x * tileSize.x - origin.x,
      y: coords.y * tileSize.y - origin.y
    };
  }
  
  function wrapNum(num, range) {
    var diff = range[1] - range[0];
    return ((num - range[0]) % diff + diff) % diff + range[0];
  }
  
  function wrapCoords(coords, wrapX, wrapY) {
    return {
      x: wrapX ? wrapNum(coords.x, wrapX) : coords.x,
      y: wrapY ? wrapNum(coords.y, wrapY) : coords.y,
      z: coords.z
    };
  }
  
  function coordsToKey(coords) {
    return coords.x + ":" + coords.y + ":" + coords.z;
  }
  
  self.onmessage = function(e) {
    const data = e.data;
    
    if (data.type === 'computeTiles') {
      const { pixelBounds, tileSize, zoom } = data.payload;
      const range = computeTileRange(pixelBounds, tileSize);
      const centerTile = {
        x: (range.min.x + range.max.x) / 2,
        y: (range.min.y + range.max.y) / 2
      };
      const tiles = [];
      for (let y = range.min.y; y <= range.max.y; y++) {
        for (let x = range.min.x; x <= range.max.x; x++) {
          tiles.push({ x: x, y: y, z: zoom });
        }
      }
      sortTiles(tiles, centerTile);
      self.postMessage({ type: 'tilesComputed', payload: { tiles: tiles } });
      
    } else if (data.type === 'getTilePos') {
      const { coords, tileSize, origin, key } = data.payload;
      const pos = getTilePos(coords, tileSize, origin);
      self.postMessage({ type: 'tilePosComputed', payload: { key: key, pos: pos } });
      
    } else if (data.type === 'wrapCoords') {
      const { coords, wrapX, wrapY, key } = data.payload;
      const wrapped = wrapCoords(coords, wrapX, wrapY);
      self.postMessage({ type: 'coordsWrapped', payload: { key: key, wrapped: wrapped } });
      
    } else if (data.type === 'coordsToKey') {
      const { coords, key } = data.payload;
      const computedKey = coordsToKey(coords);
      self.postMessage({ type: 'keyComputed', payload: { key: key, computedKey: computedKey } });
    }
  };
`;

export const GridLayer = Layer.extend({

  options: {
    tileSize: 256,
    opacity: 1,
    updateWhenIdle: Browser.mobile,
    updateWhenZooming: true,
    updateInterval: 200,
    zIndex: 1,
    bounds: null,
    minZoom: 0,
    maxZoom: undefined,
    maxNativeZoom: undefined,
    minNativeZoom: undefined,
    noWrap: false,
    pane: 'tilePane',
    className: '',
    keepBuffer: 2
  },

  initialize(options) {
    Util.setOptions(this, options);
  },

  onAdd(map) {
    this._initContainer();
    this._levels = {};
    this._tiles = {};
    if (typeof Worker !== 'undefined') {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerURL = URL.createObjectURL(blob);
      this._worker = new Worker(workerURL);
      this._worker.onmessage = (e) => {
        const type = e.data.type;
        const payload = e.data.payload;
        if (type === 'tilesComputed') {
          this._updateTilesFromWorker(payload.tiles);
        } else if (type === 'tilePosComputed') {
          const tileObj = this._tiles[payload.key];
          if (tileObj) {
            DomUtil.setPosition(tileObj.el, payload.pos);
          }
        } else if (type === 'coordsWrapped') {
          const tileObj = this._tiles[payload.key];
          if (tileObj) {
            tileObj.coords = payload.wrapped;
            tileObj.el.setAttribute('data-coords', JSON.stringify(payload.wrapped));
          }
        }
      };
    }

    this._resetView();
  },

  beforeAdd(map) {
    map._addZoomLimit(this);
  },

  onRemove(map) {
    this._removeAllTiles();
    this._container.remove();
    map._removeZoomLimit(this);
    this._container = null;
    this._tileZoom = undefined;
    clearTimeout(this._pruneTimeout);

    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
  },

  bringToFront() {
    if (this._map) {
      DomUtil.toFront(this._container);
      this._setAutoZIndex(Math.max);
    }
    return this;
  },

  bringToBack() {
    if (this._map) {
      DomUtil.toBack(this._container);
      this._setAutoZIndex(Math.min);
    }
    return this;
  },

  getContainer() {
    return this._container;
  },

  setOpacity(opacity) {
    this.options.opacity = opacity;
    this._updateOpacity();
    return this;
  },

  setZIndex(zIndex) {
    this.options.zIndex = zIndex;
    this._updateZIndex();
    return this;
  },

  isLoading() {
    return this._loading;
  },

  redraw() {
    if (this._map) {
      this._removeAllTiles();
      const tileZoom = this._clampZoom(this._map.getZoom());
      if (tileZoom !== this._tileZoom) {
        this._tileZoom = tileZoom;
        this._updateLevels();
      }
      this._update();
    }
    return this;
  },

  getEvents() {
    const events = {
      viewprereset: this._invalidateAll,
      viewreset: this._resetView,
      zoom: this._resetView,
      moveend: this._onMoveEnd
    };
    if (!this.options.updateWhenIdle) {
      if (!this._onMove) {
        this._onMove = Util.throttle(this._onMoveEnd, this.options.updateInterval, this);
      }
      events.move = this._onMove;
    }
    if (this._zoomAnimated) {
      events.zoomanim = this._animateZoom;
    }
    return events;
  },

  createTile() {
    return document.createElement('div');
  },

  getTileSize() {
    const s = this.options.tileSize;
    return s instanceof Point ? s : new Point(s, s);
  },

  _updateZIndex() {
    if (this._container && this.options.zIndex !== undefined && this.options.zIndex !== null) {
      this._container.style.zIndex = this.options.zIndex;
    }
  },

  _setAutoZIndex(compare) {
    const layers = this.getPane().children;
    let edgeZIndex = -compare(-Infinity, Infinity);
    for (let i = 0, len = layers.length, zIndex; i < len; i++) {
      zIndex = layers[i].style.zIndex;
      if (layers[i] !== this._container && zIndex) {
        edgeZIndex = compare(edgeZIndex, +zIndex);
      }
    }
    if (isFinite(edgeZIndex)) {
      this.options.zIndex = edgeZIndex + compare(-1, 1);
      this._updateZIndex();
    }
  },

  _updateOpacity() {
    if (!this._map) { return; }
    this._container.style.opacity = this.options.opacity;
    const now = +new Date();
    let nextFrame = false, willPrune = false;
    for (const key in this._tiles) {
      if (!Object.hasOwn(this._tiles, key)) { continue; }
      const tile = this._tiles[key];
      if (!tile.current || !tile.loaded) { continue; }
      const fade = Math.min(1, (now - tile.loaded) / 200);
      tile.el.style.opacity = fade;
      if (fade < 1) {
        nextFrame = true;
      } else {
        if (tile.active) {
          willPrune = true;
        } else {
          this._onOpaqueTile(tile);
        }
        tile.active = true;
      }
    }
    if (willPrune && !this._noPrune) { this._pruneTiles(); }
    if (nextFrame) {
      cancelAnimationFrame(this._fadeFrame);
      this._fadeFrame = requestAnimationFrame(this._updateOpacity.bind(this));
    }
  },

  _onOpaqueTile: Util.falseFn,

  _initContainer() {
    if (this._container) { return; }
    this._container = DomUtil.create('div', `leaflet-layer ${this.options.className || ''}`);
    this._updateZIndex();
    if (this.options.opacity < 1) {
      this._updateOpacity();
    }
    this.getPane().appendChild(this._container);
  },

  _updateLevels() {
    const zoom = this._tileZoom,
          maxZoom = this.options.maxZoom;
    if (zoom === undefined) { return undefined; }
    for (let z in this._levels) {
      if (!Object.hasOwn(this._levels, z)) { continue; }
      z = Number(z);
      if (this._levels[z].el.children.length || z === zoom) {
        this._levels[z].el.style.zIndex = maxZoom - Math.abs(zoom - z);
        this._onUpdateLevel(z);
      } else {
        this._levels[z].el.remove();
        this._removeTilesAtZoom(z);
        this._onRemoveLevel(z);
        delete this._levels[z];
      }
    }
    let level = this._levels[zoom];
    const map = this._map;
    if (!level) {
      level = this._levels[zoom] = {};
      level.el = DomUtil.create('div', 'leaflet-tile-container leaflet-zoom-animated', this._container);
      level.el.style.zIndex = maxZoom;
      level.origin = map.project(map.unproject(map.getPixelOrigin()), zoom).round();
      level.zoom = zoom;
      this._setZoomTransform(level, map.getCenter(), map.getZoom());
      Util.falseFn(level.el.offsetWidth);
      this._onCreateLevel(level);
    }
    this._level = level;
    return level;
  },

  _onUpdateLevel: Util.falseFn,
  _onRemoveLevel: Util.falseFn,
  _onCreateLevel: Util.falseFn,

  _pruneTiles() {
    if (!this._map) { return; }
    let key, tile;
    const zoom = this._map.getZoom();
    if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
      this._removeAllTiles();
      return;
    }
    for (key in this._tiles) {
      if (Object.hasOwn(this._tiles, key)) {
        tile = this._tiles[key];
        tile.retain = tile.current;
      }
    }
    for (key in this._tiles) {
      if (!Object.hasOwn(this._tiles, key)) { continue; }
      tile = this._tiles[key];
      if (tile.current && !tile.active) {
        const coords = tile.coords;
        if (!this._retainParent(coords.x, coords.y, coords.z, coords.z - 5)) {
          this._retainChildren(coords.x, coords.y, coords.z, coords.z + 2);
        }
      }
    }
    for (key in this._tiles) {
      if (!this._tiles[key].retain) {
        this._removeTile(key);
      }
    }
  },

  _removeTilesAtZoom(zoom) {
    for (const key in this._tiles) {
      if (this._tiles[key].coords.z !== zoom) { continue; }
      this._removeTile(key);
    }
  },

  _removeAllTiles() {
    for (const key in this._tiles) {
      if (Object.hasOwn(this._tiles, key)) {
        this._removeTile(key);
      }
    }
  },

  _invalidateAll() {
    for (const z in this._levels) {
      if (Object.hasOwn(this._levels, z)) {
        this._levels[z].el.remove();
        this._onRemoveLevel(Number(z));
        delete this._levels[z];
      }
    }
    this._removeAllTiles();
    this._tileZoom = undefined;
  },

  _retainParent(x, y, z, minZoom) {
    const x2 = Math.floor(x / 2),
          y2 = Math.floor(y / 2),
          z2 = z - 1,
          coords2 = new Point(x2, y2);
    coords2.z = z2;
    const key = this._tileCoordsToKey(coords2),
          tile = this._tiles[key];
    if (tile && tile.active) {
      tile.retain = true;
      return true;
    } else if (tile && tile.loaded) {
      tile.retain = true;
    }
    if (z2 > minZoom) {
      return this._retainParent(x2, y2, z2, minZoom);
    }
    return false;
  },

  _retainChildren(x, y, z, maxZoom) {
    for (let i = 2 * x; i < 2 * x + 2; i++) {
      for (let j = 2 * y; j < 2 * y + 2; j++) {
        const coords = new Point(i, j);
        coords.z = z + 1;
        const key = this._tileCoordsToKey(coords),
              tile = this._tiles[key];
        if (tile && tile.active) {
          tile.retain = true;
          continue;
        } else if (tile && tile.loaded) {
          tile.retain = true;
        }
        if (z + 1 < maxZoom) {
          this._retainChildren(i, j, z + 1, maxZoom);
        }
      }
    }
  },

  _resetView(e) {
    const animating = e && (e.pinch || e.flyTo);
    this._setView(this._map.getCenter(), this._map.getZoom(), animating, animating);
  },

  _animateZoom(e) {
    this._setView(e.center, e.zoom, true, e.noUpdate);
  },

  _clampZoom(zoom) {
    const options = this.options;
    if (undefined !== options.minNativeZoom && zoom < options.minNativeZoom) {
      return options.minNativeZoom;
    }
    if (undefined !== options.maxNativeZoom && options.maxNativeZoom < zoom) {
      return options.maxNativeZoom;
    }
    return zoom;
  },

  _setView(center, zoom, noPrune, noUpdate) {
    let tileZoom = Math.round(zoom);
    if ((this.options.maxZoom !== undefined && tileZoom > this.options.maxZoom) ||
        (this.options.minZoom !== undefined && tileZoom < this.options.minZoom)) {
      tileZoom = undefined;
    } else {
      tileZoom = this._clampZoom(tileZoom);
    }
    const tileZoomChanged = this.options.updateWhenZooming && (tileZoom !== this._tileZoom);
    if (!noUpdate || tileZoomChanged) {
      this._tileZoom = tileZoom;
      if (this._abortLoading) { this._abortLoading(); }
      this._updateLevels();
      this._resetGrid();
      if (tileZoom !== undefined) { this._update(center); }
      if (!noPrune) { this._pruneTiles(); }
      this._noPrune = !!noPrune;
    }
    this._setZoomTransforms(center, zoom);
  },

  _setZoomTransforms(center, zoom) {
    for (const i in this._levels) {
      if (Object.hasOwn(this._levels, i)) {
        this._setZoomTransform(this._levels[i], center, zoom);
      }
    }
  },

  _setZoomTransform(level, center, zoom) {
    const scale = this._map.getZoomScale(zoom, level.zoom),
          translate = level.origin.multiplyBy(scale)
                        .subtract(this._map._getNewPixelOrigin(center, zoom)).round();
    DomUtil.setTransform(level.el, translate, scale);
  },

  _resetGrid() {
    const map = this._map,
          crs = map.options.crs,
          tileSize = this._tileSize = this.getTileSize(),
          tileZoom = this._tileZoom;
    const bounds = this._map.getPixelWorldBounds(this._tileZoom);
    if (bounds) {
      this._globalTileRange = this._pxBoundsToTileRange(bounds);
    }
    this._wrapX = crs.wrapLng && !this.options.noWrap && [
      Math.floor(map.project([0, crs.wrapLng[0]], tileZoom).x / tileSize.x),
      Math.ceil(map.project([0, crs.wrapLng[1]], tileZoom).x / tileSize.y)
    ];
    this._wrapY = crs.wrapLat && !this.options.noWrap && [
      Math.floor(map.project([crs.wrapLat[0], 0], tileZoom).y / tileSize.x),
      Math.ceil(map.project([crs.wrapLat[1], 0], tileZoom).y / tileSize.y)
    ];
  },

  _onMoveEnd() {
    if (!this._map || this._map._animatingZoom) { return; }
    this._update();
  },

  _getTiledPixelBounds(center) {
    const map = this._map,
          mapZoom = map._animatingZoom ? Math.max(map._animateToZoom, map.getZoom()) : map.getZoom(),
          scale = map.getZoomScale(mapZoom, this._tileZoom),
          pixelCenter = map.project(center, this._tileZoom).floor(),
          halfSize = map.getSize().divideBy(scale * 2);
    return new Bounds(pixelCenter.subtract(halfSize), pixelCenter.add(halfSize));
  },

  _update(center) {
    const map = this._map;
    if (!map) { return; }
    const zoom = this._clampZoom(map.getZoom());
    if (center === undefined) { center = map.getCenter(); }
    if (this._tileZoom === undefined) { return; }
  
    const pixelBounds = this._getTiledPixelBounds(center);
    const simplePixelBounds = {
      min: { x: pixelBounds.min.x, y: pixelBounds.min.y },
      max: { x: pixelBounds.max.x, y: pixelBounds.max.y }
    };
  
    if (this._worker) {
      this._worker.postMessage({
        type: 'computeTiles',
        payload: {
          pixelBounds: simplePixelBounds,
          tileSize: { x: this.getTileSize().x, y: this.getTileSize().y },
          zoom: this._tileZoom,
          margin: this.options.keepBuffer
        }
      });
    } else {
      this._fallbackUpdate(center);
    }
  },

  _updateTilesFromWorker(tiles) {
    for (const key in this._tiles) {
      if (Object.hasOwn(this._tiles, key)) {
        this._tiles[key].current = false;
      }
    }
    const fragment = document.createDocumentFragment();
    tiles.forEach((obj) => {
      const coords = new Point(obj.x, obj.y);
      coords.z = obj.z;
      const key = this._tileCoordsToKey(coords);
      if (this._tiles[key]) {
        this._tiles[key].current = true;
      } else if (this._isValidTile(coords)) {
        this._addTile(coords, fragment);
      }
    });
    this._level.el.appendChild(fragment);
    this._pruneTiles();
  },
  
  _fallbackUpdate(center) {
    const map = this._map;
    if (!map) { return; }
    const zoom = this._clampZoom(map.getZoom());
    if (center === undefined) { center = map.getCenter(); }
    if (this._tileZoom === undefined) { return; }
  
    const pixelBounds = this._getTiledPixelBounds(center),
          tileRange = this._pxBoundsToTileRange(pixelBounds),
          tileCenter = tileRange.getCenter(),
          queue = [],
          margin = this.options.keepBuffer,
          noPruneRange = new Bounds(
            tileRange.getBottomLeft().subtract([margin, -margin]),
            tileRange.getTopRight().add([margin, -margin])
          );
  
    if (!(isFinite(tileRange.min.x) &&
          isFinite(tileRange.min.y) &&
          isFinite(tileRange.max.x) &&
          isFinite(tileRange.max.y))) {
      throw new Error('Attempted to load an infinite number of tiles');
    }
  
    for (const key in this._tiles) {
      if (Object.hasOwn(this._tiles, key)) {
        const c = this._tiles[key].coords;
        if (c.z !== this._tileZoom || !noPruneRange.contains(new Point(c.x, c.y))) {
          this._tiles[key].current = false;
        }
      }
    }
  
    for (let j = tileRange.min.y; j <= tileRange.max.y; j++) {
      for (let i = tileRange.min.x; i <= tileRange.max.x; i++) {
        const coords = new Point(i, j);
        coords.z = this._tileZoom;
        if (!this._isValidTile(coords)) { continue; }
        const key = this._tileCoordsToKey(coords);
        if (this._tiles[key]) {
          this._tiles[key].current = true;
        } else {
          queue.push(coords);
        }
      }
    }
  
    queue.sort((a, b) => a.distanceTo(tileCenter) - b.distanceTo(tileCenter));
    if (queue.length !== 0) {
      if (!this._loading) {
        this._loading = true;
        this.fire('loading');
      }
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < queue.length; i++) {
        this._addTile(queue[i], fragment);
      }
      this._level.el.appendChild(fragment);
    }
    this._pruneTiles();
  },
  
  _tileCoordsToNwSe(coords) {
    const map = this._map,
          tileSize = this.getTileSize(),
          nwPoint = coords.scaleBy(tileSize),
          sePoint = nwPoint.add(tileSize),
          nw = map.unproject(nwPoint, coords.z),
          se = map.unproject(sePoint, coords.z);
    return [nw, se];
  },
  
  _tileCoordsToBounds(coords) {
    const bp = this._tileCoordsToNwSe(coords);
    let bounds = new LatLngBounds(bp[0], bp[1]);
    if (!this.options.noWrap) {
      bounds = this._map.wrapLatLngBounds(bounds);
    }
    return bounds;
  },
  
  _tileCoordsToKey(coords) {
    return `${coords.x}:${coords.y}:${coords.z}`;
  },
  
  _isValidTile(coords) {
    const crs = this._map.options.crs;
    if (!crs.infinite) {
      const bounds = this._globalTileRange;
      if ((!crs.wrapLng && (coords.x < bounds.min.x || coords.x > bounds.max.x)) ||
          (!crs.wrapLat && (coords.y < bounds.min.y || coords.y > bounds.max.y))) {
        return false;
      }
    }
    if (!this.options.bounds) { return true; }
    const tileBounds = this._tileCoordsToBounds(coords);
    return latLngBounds(this.options.bounds).overlaps(tileBounds);
  },
  
  _keyToTileCoords(key) {
    const k = key.split(':'),
          coords = new Point(+k[0], +k[1]);
    coords.z = +k[2];
    return coords;
  },
  
  _removeTile(key) {
    const tile = this._tiles[key];
    if (!tile) { return; }
    tile.el.remove();
    delete this._tiles[key];
    this.fire('tileunload', {
      tile: tile.el,
      coords: this._keyToTileCoords(key)
    });
  },
  
  _initTile(tile) {
    tile.classList.add('leaflet-tile');
    const tileSize = this.getTileSize();
    tile.style.width = `${tileSize.x}px`;
    tile.style.height = `${tileSize.y}px`;
    tile.onselectstart = Util.falseFn;
    tile.onmousemove = Util.falseFn;
  },
  
  _addTile(coords, container) {
    const key = this._tileCoordsToKey(coords);
    if (this._worker) {
      this._worker.postMessage({
        type: 'wrapCoords',
        payload: {
          coords: { x: coords.x, y: coords.y, z: coords.z },
          wrapX: this._wrapX,
          wrapY: this._wrapY,
          key: key
        }
      });
      this._worker.postMessage({
        type: 'getTilePos',
        payload: {
          coords: { x: coords.x, y: coords.y, z: coords.z },
          tileSize: { x: this.getTileSize().x, y: this.getTileSize().y },
          origin: { x: this._level.origin.x, y: this._level.origin.y },
          key: key
        }
      });
    }
    // Tạo tile ngay lập tức dựa trên coords ban đầu (có thể là chưa wrapped)
    const tile = this.createTile(coords, this._tileReady.bind(this, coords));
    this._initTile(tile);
    // Nếu createTile không có callback (2 tham số) thì gọi _tileReady ngay
    if (this.createTile.length < 2) {
      requestAnimationFrame(this._tileReady.bind(this, coords, null, tile));
    }
    // Lưu đối tượng tile theo key
    this._tiles[key] = {
      el: tile,
      coords: coords,
      current: true
    };
    container.appendChild(tile);
    this.fire('tileloadstart', { tile: tile, coords: coords });
  },
  
  _tileReady(coords, err, tile) {
    if (err) {
      this.fire('tileerror', { error: err, tile: tile, coords: coords });
    }
    const key = this._tileCoordsToKey(coords);
    tile = this._tiles[key];
    if (!tile) { return; }
    tile.loaded = +new Date();
    if (this._map._fadeAnimated) {
      tile.el.style.opacity = 0;
      cancelAnimationFrame(this._fadeFrame);
      this._fadeFrame = requestAnimationFrame(this._updateOpacity.bind(this));
    } else {
      tile.active = true;
      this._pruneTiles();
    }
    if (!err) {
      tile.el.classList.add('leaflet-tile-loaded');
      this.fire('tileload', { tile: tile.el, coords: coords });
    }
    if (this._noTilesToLoad()) {
      this._loading = false;
      this.fire('load');
      if (!this._map._fadeAnimated) {
        requestAnimationFrame(this._pruneTiles.bind(this));
      } else {
        this._pruneTimeout = setTimeout(this._pruneTiles.bind(this), 250);
      }
    }
  },
  
  _getTilePos(coords) {
    // Nếu không có worker, fallback vào tính toán đồng bộ
    const tileSize = this.getTileSize();
    const pos = coords.scaleBy(tileSize).subtract(this._level.origin);
    return pos;
  },
  
  _wrapCoords(coords) {
    // Nếu không có worker, fallback vào tính toán đồng bộ sử dụng Util.wrapNum
    const newCoords = new Point(
      this._wrapX ? Util.wrapNum(coords.x, this._wrapX) : coords.x,
      this._wrapY ? Util.wrapNum(coords.y, this._wrapY) : coords.y
    );
    newCoords.z = coords.z;
    return newCoords;
  },
  
  _pxBoundsToTileRange(bounds) {
    const tileSize = this.getTileSize();
    return new Bounds(
      bounds.min.unscaleBy(tileSize).floor(),
      bounds.max.unscaleBy(tileSize).ceil().subtract([1, 1])
    );
  },
  
  _noTilesToLoad() {
    for (const key in this._tiles) {
      if (!this._tiles[key].loaded) { return false; }
    }
    return true;
  }
});

export function gridLayer(options) {
  return new GridLayer(options);
}
