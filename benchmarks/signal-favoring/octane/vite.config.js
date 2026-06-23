import { defineConfig } from 'vite';
import { vyre } from 'vyre/compiler/vite';

export default defineConfig({
	plugins: [vyre()],
	optimizeDeps: { exclude: ['vyre', 'vyre/compiler'] },
	build: { target: 'esnext', minify: false },
	server: { port: 5190, strictPort: true },
});
