leaflet-threaded

leaflet-threaded is a modern fork of Leaflet with internal support for multi-threaded rendering using Web Workers and OffscreenCanvas. It preserves the familiar Leaflet API while offering significant performance improvements, especially on lower-end devices and complex tile layers.

Overview
This project modernizes Leaflet’s tile handling logic by:

Offloading tile computations and rendering to background threads

Using OffscreenCanvas and ImageBitmap where supported

Reducing main-thread layout and paint pressure

Retaining API compatibility with existing Leaflet applications

The result is smoother rendering, lower input latency, and faster tile decoding, all while keeping the development experience simple and predictable.

Features
Multi-threaded tile rendering via WorkerPool

OffscreenCanvas-based tile drawing (where supported)

Compatibility with Bing Maps and other dynamic sources

Fast JPEG/WebP rendering with fallback strategies

Pluggable tile layer via L.tileLayer.viqy API

Works out-of-the-box in modern browsers, with graceful fallback for older ones

Folder Structure
bash
Sao chép
Chỉnh sửa
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
Demos
https://quyhoachvietnam.com.vn/demo
Uses L.tileLayer.viqy with WebP tiles, worker pool rendering, and OffscreenCanvas.

https://quyhoachvietnam.com.vn/demo2
Uses the core leaflet-threaded rendering pipeline with canvas-based tile rendering.

L.tileLayer.viqy (ver2)
A standalone tile layer implementation compatible with any Leaflet map. It provides:

Web Worker offloading for tile rendering

OffscreenCanvas rendering pipeline

Bing Maps and legacy <img> tile fallback

Support for Google Maps tiles with WebP format

Example
javascript
Sao chép
Chỉnh sửa
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
Technical Highlights
Worker-based raster and WMS tile fetching

BBOX precomputation and projection inside Worker

Uses bitmaprenderer when supported to avoid 2D draw overhead

Handles tile prioritization and scheduling across CPU cores

Avoids layout thrashing and image decoding on the main thread

Performance tuned for tile-heavy applications and multi-layer views

Usage
Install dependencies, then build the project:

arduino
Sao chép
Chỉnh sửa
npm install
npm run build
To develop or extend, clone the repo and refer to the src/ folder for entry points.

License
This project is MIT licensed, based on the original Leaflet library.
Any additional modules or files retain their respective licenses where applicable.

Philosophy
leaflet-threaded does not aim to change how developers use Leaflet.
Instead, it rewrites the internals to scale with modern browsers and CPUs—offering better UX through performance, not features.

If you already use Leaflet, you already know how to use this project.

