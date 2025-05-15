# leaflet-threaded

**leaflet-threaded** is a modern fork of Leaflet with built-in support for multi-threaded rendering using Web Workers and OffscreenCanvas. It maintains full compatibility with the familiar Leaflet API while delivering major performance improvements, particularly on lower-end devices and with complex tile layers.

## Overview

This project modernizes Leaflet’s tile rendering pipeline by:

- Offloading tile computations and rendering to background threads
- Utilizing OffscreenCanvas and ImageBitmap (where supported)
- Reducing layout and paint workload on the main thread
- Retaining full API compatibility with existing Leaflet applications

The result is smoother rendering, lower input latency, and faster tile decoding — all while keeping the development experience simple and predictable.

## Features

- Multi-threaded tile rendering via WorkerPool
- OffscreenCanvas-based tile drawing (with fallback support)
- Compatible with Bing Maps and other dynamic tile sources
- Fast JPEG/WebP rendering with intelligent fallbacks
- Pluggable tile layer via `L.tileLayer.viqy` API
- Works in modern browsers with graceful fallback for older ones

## Folder Structure

```
leaflet-threaded/
├── src/                      # Custom Leaflet source (GridLayer, TileLayer, etc.)
│   └── layer/tile/
├── L.tileLayer.viqy_ver2/   # Standalone version of L.tileLayer.viqy.js
├── demo/                     # Demo using Viqy tile layer (Web Workers + OffscreenCanvas)
├── demo2/                    # Demo using native leaflet-threaded without plugins
├── dist/                     # Compiled bundle output
├── docs/                     # Documentation files
├── spec/                     # Test cases
├── .github/, .husky/         # GitHub workflows and Git hooks
├── package.json              # NPM metadata
```

## Demos

- Demo with `L.tileLayer.viqy`:  
  https://quyhoachvietnam.com.vn/demo  
  Uses WebP tiles, worker pool rendering, and OffscreenCanvas.

- Core `leaflet-threaded` demo:  
  https://quyhoachvietnam.com.vn/demo2  
  Uses canvas-based tile rendering without plugins.

## L.tileLayer.viqy (ver2)

A standalone tile layer plugin compatible with any Leaflet map. Features include:

- Web Worker-based tile rendering
- OffscreenCanvas rendering pipeline
- Fallback to traditional `<img>` tiles for legacy support
- Bing Maps and Google Maps (WebP) compatibility

### Example

```javascript
const map = L.map('map').setView([21.0285, 105.8542], 13);

L.tileLayer.viqy(
  'https://mts{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&format=webp',
  {
    detectRetina: true,
    maxZoom: 19,
    subdomains: '0123',
    useBingMaps: false
    // bingMapsKey: 'YOUR_KEY'
  }
).addTo(map);
```

## Technical Highlights

- Worker-based raster and WMS tile fetching
- BBOX precomputation and coordinate projection inside Workers
- Uses `bitmaprenderer` (when supported) to minimize 2D canvas overhead
- Handles tile prioritization and load balancing across CPU cores
- Avoids layout thrashing and decoding overhead on the main thread
- Optimized for high-density tile maps and multiple layer scenarios

## Usage

Install dependencies and build the project:

```bash
npm install
npm run build
```

To develop or extend, clone the repository and refer to the `src/` directory for entry points.

## License

This project is MIT licensed and based on the original Leaflet library.  
Additional modules or third-party files retain their respective licenses where applicable.

## Philosophy

**leaflet-threaded** is designed to keep the Leaflet development model intact.  
It reimplements internal tile logic to better utilize modern web technologies and hardware, enabling better user experiences through performance — not added complexity.

If you already use Leaflet, you already know how to use **leaflet-threaded**.
