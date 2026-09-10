import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import base from './vite.config.js';

const root = fileURLToPath(new URL('.', import.meta.url));

// Work-only entry: ordinary `vite build` still uses index.html and never sees
// the unkeyed fixture or its descriptors in the js-framework timing bundle.
export default mergeConfig(base, {
	build: {
		outDir: 'dist/unkeyed-work',
		minify: false,
		rollupOptions: { input: resolve(root, 'unkeyed-work.html') },
	},
	preview: { port: 5316, strictPort: true },
});
