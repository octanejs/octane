import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { reactCompiler } from '../../react-compiler.mjs';

export default defineConfig({
	plugins: [react(), reactCompiler()],
	mode: 'production',
	define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	build: { minify: 'esbuild', target: 'esnext' },
	server: { port: 5345, strictPort: true },
	preview: { port: 5345, strictPort: true },
});
