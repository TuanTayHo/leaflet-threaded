# Plugin Guide for `leaflet-threaded`

This guide explains how to use the custom plugin `L.tileLayer.viqy` introduced in the `leaflet-threaded` project. It is designed for high-performance tile rendering with support for OffscreenCanvas and Web Workers.

## Overview

`L.tileLayer.viqy` is a drop-in replacement for `L.tileLayer`. It keeps the same API, but internally offloads rendering tasks to a worker thread and uses canvas drawing instead of direct `<img>` elements when possible.

Key features:

- OffscreenCanvas-based tile rendering
- Threaded tile decoding via Web Workers
- Automatic fallback to `<img>` if unsupported
- Optional support for Bing Maps with quadkey URLs
- Preserves Leaflet's standard interface

## Basic Usage

```js
const viqyLayer = L.tileLayer.viqy(
  'https://mts{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&format=webp',
  {
    subdomains: '0123',
    detectRetina: true,
    maxZoom: 19
  }
).addTo(map);
```

## Bing Maps Example

```js
const bingLayer = L.tileLayer.viqy('', {
  useBingMaps: true,
  bingMapsKey: 'YOUR_BING_MAPS_API_KEY',
  maxZoom: 21
}).addTo(map);
```

## Options

- `detectRetina` (boolean) – loads high-DPI tiles if device supports it
- `useBingMaps` (boolean) – switches to Bing Maps tile URL construction
- `bingMapsKey` (string) – required if `useBingMaps` is enabled
- `errorTileUrl` (string) – optional fallback image URL on error
- `workerPoolMax` (number) – maximum number of tile render workers
- `tileSize` (number) – default is 256; customizable

## Browser Support

The plugin will attempt to use `OffscreenCanvas`, `createImageBitmap`, and `bitmaprenderer` if available. If not, it will gracefully fall back to using standard `<img>` elements.

Tested on:

- Chrome 100+
- Firefox 100+
- Edge 100+
- Safari (fallback mode)

## Performance Notes

- Using `.webp` tiles is strongly recommended for speed and bandwidth.
- Workers offload rendering but not tile fetching; use HTTP/2/CDN for best results.
- For low-memory or low-power devices, reduce `workerPoolMax`.

## Compatibility

- Fully compatible with existing Leaflet map instances.
- Can be combined with other Leaflet plugins.
- Uses standard `L.TileLayer` prototype and lifecycle methods.

## Known Limitations

- Tiles that fail to load in workers will fall back to `<img>` with no retry.
- No caching layer is included by default; caching can be added externally.
- Quadkey-based Bing logic is specific to `aerial` tiles, not Streetside or hybrid modes.

## Contributing to This Plugin

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.

---

This plugin is designed for production use where performance and rendering speed matter. You may use it in dashboards, satellite viewers, offline map apps, or any use case where `<img>` rendering becomes a bottleneck.
