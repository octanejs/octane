import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';

export default defineConfig({
	plugins: [octane()],
	build: { target: 'esnext' },
	server: { port: 5237, strictPort: true },
});
