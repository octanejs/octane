import { octane } from '@octanejs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [octane()],
	optimizeDeps: {
		exclude: ['octane', 'octane/compiler', '@octanejs/vite-plugin'],
	},
	resolve: {
		extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
	},
	build: { target: 'esnext' },
	server: { port: 5231, strictPort: true },
});
