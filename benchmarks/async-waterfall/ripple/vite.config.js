import { defineConfig } from 'vite';
import { ripple } from '@ripple-ts/vite-plugin';

export default defineConfig({
	plugins: [ripple({ excludeRippleExternalModules: true })],
	optimizeDeps: { exclude: ['ripple'] },
	build: { minify: 'esbuild', target: 'esnext' },
	server: { port: 5219, strictPort: true },
});
