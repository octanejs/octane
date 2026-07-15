import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	plugins: [octane()],
	optimizeDeps: { exclude: ['octane', 'octane/compiler', '@octanejs/zustand'] },
	build: { target: 'esnext' },
	server: { port: 5221, strictPort: true },
});
