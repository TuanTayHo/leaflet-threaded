Changelog for the leaflet-threaded project
This document tracks major changes, updates, bug fixes, and new features across releases. It follows a clear, minimal format and may later adopt Conventional Commits or semantic versioning if needed.

Version 1.0.0 – Initial Release
Release Date: to be announced

Major Features
Complete rewrite of GridLayer, TileLayer, and TileLayer.WMS to run rendering logic in Web Workers.

Introduced OffscreenCanvas for tile rendering without DOM dependency.

Automatic fallback to <img> if the browser does not support OffscreenCanvas or Workers.

BBOX projection and tile key calculations offloaded to Worker threads.

Lightweight but efficient WorkerPool implementation with support for concurrent execution.

Performance improvements via createImageBitmap, bitmaprenderer, and internal caching.

Additional Updates
Added demo using L.tileLayer.viqy with Google WebP and Bing Maps tiles.

Retained standard Leaflet syntax and usage for end users.

Isolated plugin code (viqy) in a separate directory for easier maintenance.

Planned Future Versions
1.1.x: Add dynamic configuration support for WorkerPool, experiment with tile prefetch and lazy loading.

1.2.x: Add support for rendering vector tiles inside workers.

2.0.0: If required, extract all tile rendering logic into a reusable, standalone module decoupled from Leaflet core.

