import { defineConfig } from '@lynx-js/rspeedy';

import { pluginOctaneLynxPhase0 } from './phase0-plugin.mjs';

export default defineConfig({
	mode: 'production',
	environments: {
		lynx: {},
		web: {},
	},
	dev: {
		hmr: false,
		liveReload: false,
	},
	output: {
		cleanDistPath: true,
		filenameHash: false,
		inlineScripts: true,
		sourceMap: {
			js: 'source-map',
		},
	},
	source: {
		entry: {
			imperative: './src/imperative-baseline.mjs',
			main: './src/bundle-entry.mjs',
		},
	},
	splitChunks: false,
	plugins: [pluginOctaneLynxPhase0()],
});
