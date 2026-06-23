import { defineConfig } from 'vite';
import { vyre } from 'vyre/compiler/vite';

export default defineConfig({
	plugins: [vyre()],
	// `vyre` ships raw TS, so Vite must transform it for the SSR bundle.
	ssr: { noExternal: [/^vyre($|\/)/] },
	optimizeDeps: { exclude: ['vyre', 'vyre/compiler'] },
	build: { target: 'esnext', minify: false },
	server: { port: 5191, strictPort: true },
});
