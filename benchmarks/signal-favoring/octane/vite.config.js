import { defineConfig } from 'vite';
import { octane } from 'octane-ts/compiler/vite';

export default defineConfig({
	plugins: [octane()],
	optimizeDeps: { exclude: ['octane-ts', 'octane-ts/compiler'] },
	build: { target: 'esnext', minify: false },
	server: { port: 5190, strictPort: true },
});
