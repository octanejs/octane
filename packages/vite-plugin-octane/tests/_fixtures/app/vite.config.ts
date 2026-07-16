import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';
import { fileURLToPath } from 'node:url';

// SSR module graphs (dev + server build) must see the server runtime for bare
// 'octane' imports from non-compiled sources (none here, but keeps the fixture
// shaped like a real app).
export default defineConfig({
	plugins: [octane()],
	resolve: {
		alias: {
			'@fixture/object-canvas': fileURLToPath(new URL('./src/ObjectCanvas.tsrx', import.meta.url)),
		},
	},
	ssr: {
		noExternal: [/^octane($|\/)/],
	},
});
