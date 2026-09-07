import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	plugins: [octane()],
	optimizeDeps: {
		exclude: ['octane', 'octane/compiler'],
	},
	build: {
		target: 'esnext',
		// Untimed precise-coverage diagnostics need the original function names.
		minify: process.env.CHAT_STREAM_WORK === '1' ? false : 'esbuild',
	},
	server: { port: 5250, strictPort: true },
});
