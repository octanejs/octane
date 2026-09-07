import { defineConfig } from 'vite';
import { nitro } from 'nitro/vite';
import { tanstackStart } from '@octanejs/tanstack-start/plugin/vite';

export default defineConfig({
	build: { minify: 'esbuild' },
	server: { port: 3000 },
	plugins: [tanstackStart(), nitro()],
});
