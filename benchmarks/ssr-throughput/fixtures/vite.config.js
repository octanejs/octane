import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

// SSR-only fixture build (no client bundle, no dev server — this suite is
// Node-only). The harness (../run.mjs) invokes `vite build` with
// `build.ssr = 'src/entry-server.ts'` and an outDir override under
// benchmarks/ssr-throughput/dist/. Crib of benchmarks/news/octane-tsrx's config
// minus the port.
export default defineConfig({
	plugins: [octane()],
	// `octane` ships raw TS, so Vite must transform it for the SSR bundle.
	ssr: { noExternal: [/^octane($|\/)/] },
	optimizeDeps: { exclude: ['octane', 'octane/compiler'] },
	build: { target: 'esnext', minify: false },
});
