import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

// Identical to octane-tsrx's config except the dev port. The octane() plugin is
// still required — NOT for templates (there are none; the app is plain-.ts
// createElement), but for the surgical hook-slotting pass that gives the plain
// `.ts` component's `useState` call its per-call-site slot symbol. The row trees
// themselves have zero compiler involvement and render through the runtime's
// de-opt reconciler.
export default defineConfig({
	plugins: [octane()],
	optimizeDeps: { exclude: ['octane', 'octane/compiler'] },
	build: { target: 'esnext', minify: false },
	server: { port: 5209, strictPort: true },
});
