import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

// Identical to ../octane-tsrx/vite.config.js except the dev port. The octane()
// plugin is still required — NOT for templates (there are none; the app is
// plain-.ts createElement), but for the surgical hook-slotting pass that gives
// the plain `.ts` component's `useState` calls their per-call-site slot
// symbols. Descriptor construction and reconciliation are 100% runtime.
export default defineConfig({
	plugins: [octane()],
	optimizeDeps: {
		exclude: ['octane', 'octane/compiler'],
	},
	build: {
		target: 'esnext',
		minify: 'esbuild',
	},
	server: { port: 5215, strictPort: true },
});
