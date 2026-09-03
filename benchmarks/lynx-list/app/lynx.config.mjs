import { defineConfig } from '@lynx-js/rspeedy';
import { pluginOctane } from '@octanejs/rspeedy-plugin';

export default defineConfig({
	mode: 'production',
	environments: {
		lynx: {},
	},
	output: {
		cleanDistPath: true,
		filename: {
			bundle: '[name].[platform].bundle',
		},
		filenameHash: false,
		distPath: { root: 'dist' },
	},
	source: {
		entry: {
			main: './src/index.ts',
		},
	},
	splitChunks: false,
	plugins: [pluginOctane({ dev: false, hmr: false })],
});
