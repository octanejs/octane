import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { octane } from 'octane/compiler/vite';
import { threeRenderers } from '@octanejs/three/config';

export default defineConfig({
	plugins: [octane({ renderers: threeRenderers }), react()],
	optimizeDeps: {
		exclude: ['octane', '@octanejs/three'],
	},
	build: {
		target: 'esnext',
		minify: 'terser',
		terserOptions: {
			compress: { passes: 3, reduce_vars: false, inline: 0, toplevel: true },
			mangle: { toplevel: true },
		},
		rollupOptions: {
			input: {
				octane: new URL('./octane.html', import.meta.url).pathname,
				r3f: new URL('./r3f.html', import.meta.url).pathname,
				plain: new URL('./plain.html', import.meta.url).pathname,
			},
		},
	},
	server: { port: 5291, strictPort: true },
});
