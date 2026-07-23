import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin';
import { defineConfig } from '@lynx-js/rspeedy';
import { pluginOctane } from '@octanejs/rspeedy-plugin';

const testOutputRoot = process.env.OCTANE_LYNX_DEMO_DIST;
const testServerPort = process.env.OCTANE_LYNX_DEMO_PORT;

export default defineConfig(({ command }) => {
	const development = command === 'dev';

	return {
		mode: development ? 'development' : 'production',
		environments: {
			lynx: {},
		},
		dev: {
			hmr: development,
			liveReload: development,
		},
		output: {
			cleanDistPath: true,
			filename: {
				bundle: '[name].lynx.bundle',
			},
			filenameHash: false,
			sourceMap: {
				css: true,
				js: 'source-map',
			},
			...(testOutputRoot === undefined ? {} : { distPath: { root: testOutputRoot } }),
		},
		...(testServerPort === undefined ? {} : { server: { port: Number(testServerPort) } }),
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
