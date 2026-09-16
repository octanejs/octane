import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';

export default defineConfig({
	plugins: [octane()],
	build: { minify: 'esbuild' },
	ssr: { noExternal: [/^octane($|\/)/] },
});
