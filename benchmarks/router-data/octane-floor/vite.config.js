import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	plugins: [octane({ strong: true })],
	optimizeDeps: { exclude: ['octane', 'octane/compiler'] },
	build: { minify: 'esbuild', target: 'esnext' },
	server: { port: 5341, strictPort: true },
	preview: { port: 5341, strictPort: true },
});
