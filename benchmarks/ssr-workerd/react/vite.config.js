import { defineConfig } from 'vite';
import tsrxReact from '@tsrx/vite-plugin-react';
import { reactCompiler } from '../../react-compiler.mjs';

// Worker-bundle fixture build (module Worker for workerd) — React target.
// `.tsrx` → (tsrxReact) React automatic-runtime JavaScript → React Compiler;
// the harness builds `src/worker.ts` with `ssr.target = 'webworker'` and
// `ssr.noExternal = true`, so react + react-dom/server.edge bundle into the
// script exactly as a real Workers deployment does.
export default defineConfig({
	plugins: [tsrxReact(), reactCompiler()],
	build: { target: 'esnext', minify: false },
});
