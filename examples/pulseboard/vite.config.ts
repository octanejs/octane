import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	plugins: [octane()],
	optimizeDeps: {
		exclude: [
			'octane',
			'octane/compiler',
			'@octanejs/tanstack-table',
			'@octanejs/tanstack-virtual',
			'@octanejs/visx',
		],
	},
	resolve: {
		extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
	},
	build: { target: 'esnext' },
	server: { port: 5229, strictPort: true },
});
