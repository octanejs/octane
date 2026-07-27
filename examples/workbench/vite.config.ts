import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	plugins: [octane()],
	build: { target: 'esnext' },
	// Tauri serves the built assets from a custom protocol, so every URL the
	// bundle emits has to stay relative to index.html rather than site-absolute.
	base: './',
	server: { port: 5231, strictPort: true },
});
