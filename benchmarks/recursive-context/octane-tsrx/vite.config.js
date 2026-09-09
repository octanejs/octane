import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	plugins: [octane()],
	optimizeDeps: { exclude: ['octane', 'octane/compiler'] },
	build: {
		target: 'esnext',
		minify: 'esbuild',
		rollupOptions: {
			input: {
				recursive: fileURLToPath(new URL('./index.html', import.meta.url)),
				contextCache: fileURLToPath(new URL('./context-cache.html', import.meta.url)),
				warmPlanControl: fileURLToPath(new URL('./warm-plan-control.html', import.meta.url)),
				warmAdoption: fileURLToPath(new URL('./warm-adoption.html', import.meta.url)),
			},
		},
	},
	server: { port: 5185, strictPort: true },
});
