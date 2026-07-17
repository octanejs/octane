import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
	plugins: [preact()],
	publicDir: '../shared/public',
	build: { target: 'esnext' },
	server: { port: 5294, strictPort: true },
});
