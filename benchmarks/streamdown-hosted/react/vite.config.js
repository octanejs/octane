import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react()],
	build: {
		target: 'esnext',
		minify: 'terser',
		terserOptions: {
			compress: { passes: 2, toplevel: true },
			mangle: { toplevel: true },
		},
	},
	server: { port: 5300, strictPort: true },
});
