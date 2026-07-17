import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';

export default defineConfig({
	plugins: [octane()],

	server: {
		// The website dev server owns 5179.
		port: 5180,
	},

	build: {
		target: 'esnext',
	},
});
