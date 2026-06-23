import { defineConfig } from 'vite';
import { octane } from 'octane-ts/compiler/vite';

export default defineConfig({
	plugins: [octane()],
	// `octane` ships raw TS, so Vite must transform it for the SSR bundle.
	ssr: { noExternal: [/^octane-ts($|\/)/] },
	optimizeDeps: { exclude: ['octane-ts', 'octane-ts/compiler'] },
	build: { target: 'esnext', minify: false },
	server: { port: 5191, strictPort: true },
});
