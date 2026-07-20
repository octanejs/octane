import { defineConfig } from 'vite';
import { tanstackStart } from '@octanejs/tanstack-start/plugin/vite';

// Minimal-host build: the SAME app without nitro. The Start core plugin's
// buildApp emits dist/client + dist/server/server.js (default entry exporting
// { fetch }) — the exact shape the react flavor's `vite build` produces — so
// serve.mjs can front it with the same ~40-line node:http host as
// ../react/serve.mjs. The perf harness measures BOTH this flavor
// (octane-minimal) and the nitro .output flavor (octane-nitro); their delta is
// the deployment host's overhead, isolated from the renderer's.
export default defineConfig({
	server: { port: 3000 },
	plugins: [tanstackStart()],
});
