import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit({ adapter: adapter({ fallback: '200.html' }) })],
	build: { minify: 'esbuild', target: 'esnext' },
	server: { port: 5346, strictPort: true },
	preview: { port: 5346, strictPort: true },
});
