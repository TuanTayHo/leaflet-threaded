// Config file for running Rollup

import json from '@rollup/plugin-json';
import pkg from '../package.json';
import { createBanner } from './banner';

const release = process.env.NODE_ENV === 'release';
const watch = process.argv.includes('-w') || process.argv.includes('--watch');

// Nếu không phải release thì gắn thêm dev vào version
const version = release ? pkg.version : `${pkg.version}+dev`;
const banner = createBanner(version);

const outro = `var oldL = window.L;
exports.noConflict = function() {
	window.L = oldL;
	return this;
}
// Always export us to window global (see #2364)
window.L = exports;`;

/** @type {import('rollup').RollupOptions} */
const config = {
	input: 'src/Leaflet.js',
	output: [
		{
			file: pkg.main,
			format: 'umd',
			name: 'leaflet',
			banner: banner,
			outro: outro,
			sourcemap: true,
			freeze: false,
			esModule: false
		}
	],
	plugins: [
		json()
	]
};

// Thêm output cho ESM và CommonJS nếu không ở chế độ watch
if (!watch) {
	config.output.push(
		{
			file: 'dist/leaflet-src.esm.js',
			format: 'es',
			banner: banner,
			sourcemap: true,
			freeze: false
		},
		{
			file: 'dist/leaflet.cjs.js',
			format: 'cjs',
			banner: banner,
			sourcemap: true,
			freeze: false
		}
	);
}

export default config;
