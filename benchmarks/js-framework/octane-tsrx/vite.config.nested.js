import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import base from './vite.config.js';

const root = fileURLToPath(new URL('.', import.meta.url));

// This fixture is absent from the ordinary js-framework build.
export default mergeConfig(base, {
	build: {
		outDir: 'dist/nested-work',
		rollupOptions: { input: resolve(root, 'nested-work.html') },
	},
	preview: { port: 5317, strictPort: true },
});
