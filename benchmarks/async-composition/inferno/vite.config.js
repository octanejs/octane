import { defineConfig } from 'vite';
import { infernoCompiler } from '../../inferno-vite.mjs';

export default defineConfig({
	plugins: [infernoCompiler()],
	mode: 'production',
	define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	build: { target: 'esnext' },
	server: { port: 5334, strictPort: true },
});
