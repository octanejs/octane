import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	plugins: [octane()],
	build: { target: 'esnext' },
	// Electron loads file:// assets, so every URL stays relative to index.html.
	base: './',
	server: { port: 5232, strictPort: true },
});
