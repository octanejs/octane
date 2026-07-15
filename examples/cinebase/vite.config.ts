import { defineConfig, type Plugin } from 'vite';
import { octane } from 'octane/compiler/vite';

function octaneServerAlias(): Plugin {
	return {
		name: 'cinebase-octane-server-alias',
		enforce: 'pre',
		async resolveId(source, importer, options) {
			if (!options?.ssr || source !== 'octane') return null;
			const resolved = await this.resolve('octane/server', importer, { skipSelf: true });
			return resolved?.id ?? null;
		},
	};
}

export default defineConfig({
	plugins: [octaneServerAlias(), octane()],
	ssr: {
		noExternal: [/^octane($|\/)/, /^@octanejs\/apollo-client($|\/)/],
	},
	optimizeDeps: {
		exclude: ['octane', '@octanejs/apollo-client'],
	},
	build: { target: 'esnext' },
});
