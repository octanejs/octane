import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	publicDir: '../shared/public',
	build: { target: 'esnext' },
	server: { port: 5293, strictPort: true },
});
