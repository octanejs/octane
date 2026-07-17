import type { Plugin } from 'vite';
import {
	discoverOctaneSourceDependencies,
	octane,
	type OctaneVitePluginOptions,
} from 'octane/compiler/vite';

export const options = {
	hmr: false,
	ssr: true,
	profile: false,
	requireDirective: true,
	exclude: ['/host-owned/'],
	renderers: {
		registry: {
			object: {
				module: '/src/object-renderer.js',
				server: 'client-only',
			},
		},
		rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
	},
} satisfies OctaneVitePluginOptions;

export const plugin: Plugin = octane(options);
export const discovered: string[] = discoverOctaneSourceDependencies(process.cwd());

// @ts-expect-error — compiler options are a closed public surface.
octane({ handWrittenViteShim: true });

octane({
	renderers: {
		registry: {
			object: {
				module: '/src/object-renderer.js',
				// @ts-expect-error — renderer server policies are a closed union.
				server: 'sometimes',
			},
		},
	},
});
