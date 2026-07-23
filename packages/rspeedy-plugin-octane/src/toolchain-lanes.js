const SHARED_PACKAGES = Object.freeze({
	'@lynx-js/cache-events-webpack-plugin': '0.2.0',
	'@lynx-js/chunk-loading-webpack-plugin': '0.4.1',
	'@lynx-js/css-extract-webpack-plugin': '0.9.0',
	'@lynx-js/debug-metadata': '0.1.0',
	'@lynx-js/debug-metadata-rsbuild-plugin': '0.2.0',
	'@lynx-js/rspeedy': '0.16.0',
	'@lynx-js/runtime-wrapper-webpack-plugin': '0.2.2',
	'@lynx-js/tasm': '0.0.39',
	'@lynx-js/template-webpack-plugin': '0.13.0',
	'@lynx-js/testing-environment': '0.3.0',
	'@lynx-js/types': '4.1.0',
	'@lynx-js/web-core': '0.22.2',
	'@lynx-js/web-rsbuild-server-middleware': '0.22.2',
	'@lynx-js/webpack-dev-transport': '0.3.0',
	'@lynx-js/webpack-runtime-globals': '0.0.7',
	'@lynx-js/websocket': '0.0.4',
	'@rsbuild/core': '2.1.4',
	'@rsbuild/plugin-css-minimizer': '2.0.0',
	'@rsdoctor/rspack-plugin': '1.5.18',
	typescript: '5.9.3',
	webpack: '5.109.0',
});

function lane(description, rspack) {
	return Object.freeze({
		description,
		lynxSdk: '3.9.0',
		targetSdk: '3.9',
		packages: Object.freeze({ ...SHARED_PACKAGES, '@rspack/core': rspack }),
	});
}

/**
 * Exact, indivisible Lynx build graphs covered by the compatibility smoke.
 *
 * Rspeedy 0.16.0 requires Rsbuild 2.1.4 exactly. Rsbuild 2.1.4 in turn accepts
 * Rspack ~2.1.2, so the current lane advances only that declared-compatible
 * edge. The template plugin requires tasm 0.0.39 exactly; the newer standalone
 * tasm release is therefore intentionally not mixed into either graph.
 */
export const LYNX_TOOLCHAIN_LANES = Object.freeze({
	minimum: lane('Audited Lynx Stack release graph', '2.1.3'),
	current: lane('Current registry graph within Rspeedy/Rsbuild constraints', '2.1.5'),
});
