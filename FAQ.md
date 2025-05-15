# Frequently Asked Questions (FAQ)

This document addresses common questions about the `leaflet-threaded` project and its plugin `L.tileLayer.viqy`.

---

### What is `leaflet-threaded`?

It is a performance-optimized fork of Leaflet's tile infrastructure. It adds support for tile rendering via Web Workers and OffscreenCanvas, improving responsiveness and rendering smoothness under load.

---

### Do I need to change how I use `L.tileLayer`?

No. You can switch from `L.tileLayer(...)` to `L.tileLayer.viqy(...)` with minimal or no code changes. All standard options are supported.

---

### What browsers are supported?

The plugin uses modern APIs like OffscreenCanvas and createImageBitmap when available, and falls back to HTML `<img>` elements if not.

Fully supported:

- Chrome
- Firefox
- Edge
- Opera

Fallback mode:

- Safari
- Mobile browsers with limited worker support

---

### Can I use Bing Maps tiles?

Yes. Use the `useBingMaps: true` option along with your `bingMapsKey`.

```js
L.tileLayer.viqy('', {
  useBingMaps: true,
  bingMapsKey: 'YOUR_API_KEY'
});
```

---

### Does it cache tiles?

Currently, the plugin does not implement persistent tile caching. You may implement your own caching layer using IndexedDB, service workers, or server-side headers.

---

### How does it affect performance?

Rendering is offloaded from the main thread, so:

- Map movement stays smooth during heavy tile loading
- WebP tiles decode faster in workers
- Canvas rendering avoids layout shifts from `<img>` tags

---

### Is it compatible with Leaflet plugins?

Yes, as long as the plugin doesn't directly manipulate internal tile DOM elements. All public APIs and lifecycle methods are respected.

---

### Does it support Retina/HiDPI tiles?

Yes. Set `detectRetina: true` in options, or leave it enabled by default.

---

### Why are some tiles still using `<img>`?

If the browser does not support OffscreenCanvas, or if the fetch fails inside a worker, the plugin will fall back to standard image tags to guarantee tile visibility.

---

### How many workers are used?

By default, up to 4 workers are spawned. You can control this with:

```js
workerPoolMax: 2 // or another value
```

It automatically respects hardware concurrency and browser limits.

---

### What’s the difference between `demo/` and `demo2/`?

- `demo/` uses `L.tileLayer.viqy`, including worker/canvas/WebP logic.
- `demo2/` showcases the internal rewrite of GridLayer and TileLayer with improved tile management, but using `<img>` elements only.

---

### Can I use it in production?

Yes. The plugin is designed with production use in mind. However, you should test on your target devices and browsers before deploying.

---

For other questions, bug reports, or suggestions, please open an issue on GitHub:
https://github.com/TuanTayHo/leaflet-threaded/issues
