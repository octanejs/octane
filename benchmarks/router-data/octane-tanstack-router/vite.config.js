import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	plugins: [octane()],
	optimizeDeps: { exclude: ['octane', 'octane/compiler'] },
	build: { minify: 'esbuild', target: 'esnext' },
	server: { port: 5343, strictPort: true },
	preview: { port: 5343, strictPort: true },
});
