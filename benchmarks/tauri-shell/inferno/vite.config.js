import { defineConfig } from 'vite';
import { infernoCompiler } from '../../inferno-vite.mjs';

export default defineConfig({
	plugins: [infernoCompiler()],
	base: './',
	mode: 'production',
	define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	build: {
		target: 'esnext',
		minify: 'terser',
		terserOptions: { compress: { passes: 2, toplevel: true }, mangle: { toplevel: true } },
	},
});
