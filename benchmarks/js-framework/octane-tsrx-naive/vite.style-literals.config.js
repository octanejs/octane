import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

// Keep the canonical js-framework app and its bundled bytes untouched.
export default defineConfig({
	plugins: [octane()],
	optimizeDeps: { exclude: ['octane', 'octane/compiler'] },
	build: {
		target: 'esnext',
		minify: false,
		outDir: 'dist/style-literals',
		rollupOptions: { input: resolve(import.meta.dirname, 'style-literals.html') },
	},
	preview: { port: 5233, strictPort: true },
});
