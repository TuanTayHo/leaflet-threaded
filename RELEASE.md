Project Name: leaflet-threaded
Release Purpose
This release is a custom fork of Leaflet focusing on performance, multi-threading, and rendering scalability for modern web mapping applications.

Unlike feature-based rewrites or API changes, leaflet-threaded keeps the standard Leaflet API but fully re-implements the tile processing and rendering internals.

General Information
Version: 1.0.0

Release Date: TBD (based on initial GitHub commit)

Status: Stable, tested across major modern browsers (Chrome, Firefox, Edge)

Main Components
1. Core Layers: GridLayer, TileLayer, TileLayer.WMS
Completely rewritten to support Workers and DOM-independent rendering.

All tile math (position, range, wrap, key generation) is handled in background threads.

Uses postMessage to transfer results back to the main thread.

2. L.tileLayer.viqy (ver2)
A standalone plugin, not dependent on the internal structure of leaflet-threaded.

Can be used in any Leaflet project to take advantage of worker-based canvas rendering.

Automatically falls back to <img> if needed.

3. Included Demos
demo/: uses the viqy tile layer with Google WebP or Bing Maps.

demo2/: uses the native leaflet-threaded tile rendering logic.

Key Highlights in This Release
Implements a multi-threaded architecture (Web Workers) for tile layers.

Uses OffscreenCanvas when supported by the browser.

Renders tiles via createImageBitmap and bitmaprenderer for speed and reduced overhead.

Offloads all heavy operations from the main thread to improve interaction performance.

Maintains API compatibility with classic Leaflet usage patterns.

Planned Roadmap
Modularize the internal WorkerPool for reuse across tile systems.

Add advanced WMS tile layer support (with persistent BBOX caching).

Provide benchmark scripts to compare modes (viqy vs. native).

Test deployment performance on low-spec mobile hardware.

Notes
All source code has been manually reviewed and verified through the included demos.
Some components are not yet covered by automated testing, but can be extended via the spec/ directory.