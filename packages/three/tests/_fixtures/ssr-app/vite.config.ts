import { octane } from '@octanejs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [octane({ hmr: false })],
	ssr: {
		noExternal: [/^octane($|\/)/, /^@octanejs\/three($|\/)/],
	},
});
