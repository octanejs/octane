import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	plugins: [octane()],
	publicDir: '../shared/public',
	optimizeDeps: {
		exclude: ['octane', 'octane/compiler'],
	},
	build: { target: 'esnext' },
	server: { port: 5292, strictPort: true },
});
