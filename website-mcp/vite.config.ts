import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';

export default defineConfig({
	plugins: [octane()],

	// octane.config.ts is bundled into the server entry, so its adapter choice
	// must be fixed at build time. A Worker has no WORKERS_CI to read at runtime.
	define: {
		'process.env.WORKERS_CI': JSON.stringify(process.env.WORKERS_CI ?? ''),
	},

	server: {
		// The website dev server owns 5179.
		port: 5180,
	},

	build: {
		target: 'esnext',
	},
});
