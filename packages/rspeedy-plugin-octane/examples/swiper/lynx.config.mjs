import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin';
import { defineConfig } from '@lynx-js/rspeedy';
import { pluginOctane } from '@octanejs/rspeedy-plugin';

export default defineConfig(({ command }) => {
	const development = command === 'dev';

	return {
		mode: development ? 'development' : 'production',
		// Both Lynx targets: `lynx` is the native bundle Explorer loads, `web` is
		// the Lynx-for-Web bundle the octanejs.dev <Go> preview mounts through
		// @lynx-js/web-core. Pass `--environment lynx` to skip the web graph when
		// only the native loop matters.
		environments: {
			lynx: {},
			web: {},
		},
		dev: {
			hmr: development,
			liveReload: development,
		},
		output: {
			// Emitted asset URLs are resolved by the Lynx runtime, which has no
			// notion of "relative to the bundle": Explorer fetches them over the
			// network from a QR scan, and the website serves this example from a
			// nested path. Whoever publishes the bundle sets the prefix; a bare
			// `rspeedy dev`/`build` keeps rspeedy's own default.
			assetPrefix: process.env.OCTANE_LYNX_ASSET_PREFIX,
			cleanDistPath: true,
			dataUriLimit: 0,
			filename: {
				bundle: '[name].[platform].bundle',
			},
			filenameHash: false,
			sourceMap: {
				css: true,
				js: 'source-map',
			},
		},
		source: {
			entry: {
				main: './src/index.ts',
			},
		},
		splitChunks: false,
		plugins: [
			pluginQRCode({ fullscreen: true }),
			pluginOctane({ dev: development, hmr: development }),
		],
	};
});
