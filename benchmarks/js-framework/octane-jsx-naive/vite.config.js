import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

// Identical to ../octane-jsx/vite.config.js except the dev port, so the naive
// twin's build output differs from the tuned fixture ONLY by authoring shape.
export default defineConfig({
	plugins: [octane()],
	optimizeDeps: {
		exclude: ['octane', 'octane/compiler'],
	},
	build: {
		target: 'esnext',
		minify: 'terser',
		terserOptions: {
			compress: {
				passes: 5,
				reduce_vars: false,
				inline: 0,
				booleans: false,
				comparisons: false,
				toplevel: true,
			},
			mangle: { toplevel: true },
		},
	},
	server: { port: 5214, strictPort: true },
});
