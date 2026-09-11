import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import base from './vite.config.js';

const root = fileURLToPath(new URL('.', import.meta.url));

export default mergeConfig(base, {
	base: './',
	build: {
		outDir: 'dist/key-callback-work',
		rollupOptions: { input: resolve(root, 'key-callback-work.html') },
	},
});
