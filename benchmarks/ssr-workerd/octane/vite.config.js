import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

// Worker-bundle fixture build (module Worker for workerd — this suite is
// Node-only, no dev server). The harness (../run.mjs) invokes `vite build`
// with `build.ssr = 'src/worker.ts'`, `ssr.target = 'webworker'`, and
// `ssr.noExternal = true` (Workers have no node_modules — EVERYTHING bundles
// into the script, which is exactly the deploy-relevant size being measured).
// Crib of ../../streaming-ssr/octane/vite.config.js.
export default defineConfig({
	plugins: [octane()],
	optimizeDeps: { exclude: ['octane', 'octane/compiler'] },
	build: { target: 'esnext', minify: false },
});
