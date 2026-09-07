import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { reactCompiler } from '../../react-compiler.mjs';

export default defineConfig({
	build: { minify: 'esbuild' },
	resolve: { tsconfigPaths: true },
	server: { port: 3000 },
	plugins: [tanstackStart(), viteReact(), reactCompiler()],
});
