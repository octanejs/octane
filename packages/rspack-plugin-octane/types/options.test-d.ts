import type { OctaneRspackLoaderOptions, OctaneRspackPluginOptions } from './index.js';

const loaderOptions: OctaneRspackLoaderOptions = {
	layerSpecializations: {
		'native:main': {
			renderers: {
				registry: {
					native: {
						module: '@fixture/native-main-renderer',
						capabilities: ['main-thread-render-only'],
						firstScreenEvents: ['bind*', 'catch*'],
					},
				},
				default: 'native',
			},
			universalRuntime: { runtime: 'native', thread: 'main-thread' },
		},
	},
};

const pluginOptions: OctaneRspackPluginOptions = {
	layerSpecializations: {
		'native:main': {
			runtime: '@fixture/native-main-runtime',
			universalRuntime: { runtime: 'native', thread: 'main-thread' },
		},
	},
};

const unsupportedLoaderRuntime: OctaneRspackLoaderOptions = {
	layerSpecializations: {
		'native:main': {
			// @ts-expect-error The standalone loader cannot install an issuer-layer runtime alias.
			runtime: '@fixture/native-main-runtime',
		},
	},
};

void loaderOptions;
void pluginOptions;
void unsupportedLoaderRuntime;
