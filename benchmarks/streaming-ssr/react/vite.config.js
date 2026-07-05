import { defineConfig } from 'vite';
import tsrxReact from '@tsrx/vite-plugin-react';

// SSR-only fixture build (no client bundle, no dev server — this suite is
// Node-only). `.tsrx` → (tsrxReact) React TSX → Vite/esbuild's automatic JSX
// runtime; the harness builds `src/entry-server.ts` with an outDir override
// under benchmarks/streaming-ssr/dist/.
export default defineConfig({
	plugins: [tsrxReact()],
	build: { target: 'esnext', minify: false },
});
