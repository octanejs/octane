import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	plugins: [octane()],
	resolve: {
		extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
	},
	optimizeDeps: {
		exclude: ['monaco-editor'],
	},
	worker: {
		format: 'es',
	},
	build: { target: 'esnext' },
	server: { port: 5215, strictPort: true },
});
