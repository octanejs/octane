import { existsSync, realpathSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { LYNX_TOOLCHAIN_LANES } from './toolchain-lanes.js';

const BUILD_PACKAGES = Object.freeze([
	'@lynx-js/cache-events-webpack-plugin',
	'@lynx-js/chunk-loading-webpack-plugin',
	'@lynx-js/css-extract-webpack-plugin',
	'@lynx-js/debug-metadata',
	'@lynx-js/debug-metadata-rsbuild-plugin',
	'@lynx-js/rspeedy',
	'@lynx-js/runtime-wrapper-webpack-plugin',
	'@lynx-js/template-webpack-plugin',
	'@lynx-js/types',
	'@lynx-js/web-rsbuild-server-middleware',
	'@lynx-js/webpack-dev-transport',
	'@lynx-js/websocket',
	'@rsbuild/core',
	'@rsbuild/plugin-css-minimizer',
	'@rsdoctor/rspack-plugin',
	'@rspack/core',
]);

const RSPEEDY_BUILD_PACKAGES = Object.freeze([
	'@lynx-js/cache-events-webpack-plugin',
	'@lynx-js/chunk-loading-webpack-plugin',
	'@lynx-js/debug-metadata-rsbuild-plugin',
	'@lynx-js/web-rsbuild-server-middleware',
	'@lynx-js/webpack-dev-transport',
	'@lynx-js/websocket',
	'@rsbuild/plugin-css-minimizer',
	'@rsdoctor/rspack-plugin',
]);

const EXPECTED_RSPEEDY_DEPENDENCIES = Object.freeze({
	'@lynx-js/cache-events-webpack-plugin': '^0.2.0',
	'@lynx-js/chunk-loading-webpack-plugin': '^0.4.1',
	'@lynx-js/debug-metadata-rsbuild-plugin': '^0.2.0',
	'@lynx-js/web-rsbuild-server-middleware': '0.22.2',
	'@lynx-js/webpack-dev-transport': '^0.3.0',
	'@lynx-js/websocket': '^0.0.4',
	'@rsbuild/core': '2.1.4',
	'@rsbuild/plugin-css-minimizer': '2.0.0',
	'@rsdoctor/rspack-plugin': '~1.5.6',
});

const PLUGIN_PACKAGES = Object.freeze([
	'@lynx-js/css-extract-webpack-plugin',
	'@lynx-js/runtime-wrapper-webpack-plugin',
	'@lynx-js/template-webpack-plugin',
	'@lynx-js/webpack-dev-transport',
]);

const EXPECTED_TEMPLATE_DEPENDENCIES = Object.freeze({
	'@lynx-js/tasm': '0.0.39',
	'@lynx-js/web-core': '0.22.2',
	'@lynx-js/webpack-runtime-globals': '^0.0.7',
});

const pluginRequire = createRequire(import.meta.url);

function readPackage(request, packageName) {
	let filename;
	try {
		filename = request.resolve(`${packageName}/package.json`);
	} catch (error) {
		for (const searchPath of request.resolve.paths(packageName) ?? []) {
			const candidate = join(searchPath, ...packageName.split('/'), 'package.json');
			if (existsSync(candidate)) {
				filename = candidate;
				break;
			}
		}
		if (filename === undefined) {
			try {
				let directory = dirname(request.resolve(packageName));
				while (true) {
					const candidate = join(directory, 'package.json');
					try {
						const manifest = JSON.parse(readFileSync(candidate, 'utf8'));
						if (manifest.name === packageName) {
							filename = candidate;
							break;
						}
					} catch {
						// Keep walking through package-internal directories.
					}
					const parent = dirname(directory);
					if (parent === directory) break;
					directory = parent;
				}
			} catch {
				// Report the original package-json resolution error below.
			}
		}
		if (filename === undefined) {
			throw new Error(
				`@octanejs/rspeedy-plugin: cannot resolve required ${packageName}. Install one supported atomic compatibility lane.`,
				{ cause: error },
			);
		}
	}
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(filename, 'utf8'));
	} catch (error) {
		throw new Error(`@octanejs/rspeedy-plugin: cannot read ${filename}.`, { cause: error });
	}
	return {
		dependencies: manifest.dependencies ?? {},
		filename: realpathSync(filename),
		version: manifest.version,
	};
}

/**
 * Validate a supported Rspeedy core and framework-neutral plugin graph.
 *
 * Rspeedy and the application must resolve the same physical Rsbuild and
 * Rspack packages. Two compatible-looking instances still carry distinct
 * plugin classes, hooks, and compiler state, so accepting them is unsafe.
 */
export function assertLynxToolchain(root, requestedLane) {
	if (requestedLane !== undefined && !Object.hasOwn(LYNX_TOOLCHAIN_LANES, requestedLane)) {
		throw new TypeError(
			`@octanejs/rspeedy-plugin: unknown Lynx toolchain lane ${JSON.stringify(requestedLane)}.`,
		);
	}
	const appRequire = createRequire(join(root, 'package.json'));
	const rspeedy = readPackage(appRequire, '@lynx-js/rspeedy');
	const rspeedyRequire = createRequire(rspeedy.filename);
	const lynxPackage = readPackage(pluginRequire, '@octanejs/lynx');
	const packages = {
		'@lynx-js/rspeedy': rspeedy,
		'@lynx-js/types': readPackage(createRequire(lynxPackage.filename), '@lynx-js/types'),
		'@rsbuild/core': readPackage(appRequire, '@rsbuild/core'),
		'@rspack/core': readPackage(appRequire, '@rspack/core'),
		...Object.fromEntries(
			RSPEEDY_BUILD_PACKAGES.map((name) => [name, readPackage(rspeedyRequire, name)]),
		),
		...Object.fromEntries(PLUGIN_PACKAGES.map((name) => [name, readPackage(pluginRequire, name)])),
	};
	const debugMetadataPlugin = packages['@lynx-js/debug-metadata-rsbuild-plugin'];
	if (debugMetadataPlugin.dependencies['@lynx-js/debug-metadata'] !== '^0.1.0') {
		throw new Error(
			`@octanejs/rspeedy-plugin: @lynx-js/debug-metadata-rsbuild-plugin requests @lynx-js/debug-metadata@${String(debugMetadataPlugin.dependencies['@lynx-js/debug-metadata'])}; the supported lanes require @lynx-js/debug-metadata@^0.1.0.`,
		);
	}
	packages['@lynx-js/debug-metadata'] = readPackage(
		createRequire(debugMetadataPlugin.filename),
		'@lynx-js/debug-metadata',
	);
	for (const [name, expectedRequest] of Object.entries(EXPECTED_RSPEEDY_DEPENDENCIES)) {
		const request = rspeedy.dependencies[name];
		if (request !== expectedRequest) {
			throw new Error(
				`@octanejs/rspeedy-plugin: @lynx-js/rspeedy requests ${name}@${String(request)}; the supported lanes require ${name}@${expectedRequest}.`,
			);
		}
	}
	const candidates =
		requestedLane === undefined
			? Object.entries(LYNX_TOOLCHAIN_LANES)
			: [[requestedLane, LYNX_TOOLCHAIN_LANES[requestedLane]]];
	const matches = candidates.filter(([, lane]) =>
		BUILD_PACKAGES.every((name) => packages[name].version === lane.packages[name]),
	);
	if (matches.length !== 1) {
		const actual = BUILD_PACKAGES.map((name) => `${name}@${packages[name].version}`).join(', ');
		const expected = candidates
			.map(
				([name, lane]) =>
					`${name} (${BUILD_PACKAGES.map(
						(packageName) => `${packageName}@${lane.packages[packageName]}`,
					).join(', ')})`,
			)
			.join('; ');
		throw new Error(
			`@octanejs/rspeedy-plugin: incompatible Lynx toolchain graph (${actual}); supported atomic lanes are ${expected}.`,
		);
	}
	const [, selectedLane] = matches[0];
	for (const name of ['@rsbuild/core', '@rspack/core', '@lynx-js/webpack-dev-transport']) {
		const fromRspeedy = readPackage(rspeedyRequire, name);
		if (fromRspeedy.filename !== packages[name].filename) {
			throw new Error(
				`@octanejs/rspeedy-plugin: duplicate ${name} instances detected (${packages[name].filename} and ${fromRspeedy.filename}). Install the exact compatibility set in one physical dependency graph.`,
			);
		}
	}
	const cssTemplate = readPackage(
		createRequire(packages['@lynx-js/css-extract-webpack-plugin'].filename),
		'@lynx-js/template-webpack-plugin',
	);
	if (cssTemplate.filename !== packages['@lynx-js/template-webpack-plugin'].filename) {
		throw new Error(
			`@octanejs/rspeedy-plugin: duplicate @lynx-js/template-webpack-plugin instances detected (${packages['@lynx-js/template-webpack-plugin'].filename} and ${cssTemplate.filename}). Install the exact compatibility set in one physical dependency graph.`,
		);
	}
	const templateRequire = createRequire(packages['@lynx-js/template-webpack-plugin'].filename);
	for (const [name, expectedRequest] of Object.entries(EXPECTED_TEMPLATE_DEPENDENCIES)) {
		const requested = packages['@lynx-js/template-webpack-plugin'].dependencies[name];
		if (requested !== expectedRequest) {
			throw new Error(
				`@octanejs/rspeedy-plugin: @lynx-js/template-webpack-plugin requests ${name}@${String(requested)}; the supported lanes require ${name}@${expectedRequest}.`,
			);
		}
		const installed = readPackage(templateRequire, name);
		const expectedVersion = selectedLane.packages[name];
		if (installed.version !== expectedVersion) {
			throw new Error(
				`@octanejs/rspeedy-plugin: @lynx-js/template-webpack-plugin resolves ${name}@${installed.version}; the selected lane requires exactly ${name}@${expectedVersion}.`,
			);
		}
		packages[name] = installed;
	}
	const wrapperRuntimeGlobals = readPackage(
		createRequire(packages['@lynx-js/runtime-wrapper-webpack-plugin'].filename),
		'@lynx-js/webpack-runtime-globals',
	);
	if (wrapperRuntimeGlobals.filename !== packages['@lynx-js/webpack-runtime-globals'].filename) {
		throw new Error(
			`@octanejs/rspeedy-plugin: duplicate @lynx-js/webpack-runtime-globals instances detected (${packages['@lynx-js/webpack-runtime-globals'].filename} and ${wrapperRuntimeGlobals.filename}). Install the exact compatibility set in one physical dependency graph.`,
		);
	}
	for (const packageName of [
		'@lynx-js/cache-events-webpack-plugin',
		'@lynx-js/chunk-loading-webpack-plugin',
	]) {
		const runtimeGlobals = readPackage(
			createRequire(packages[packageName].filename),
			'@lynx-js/webpack-runtime-globals',
		);
		if (runtimeGlobals.filename !== packages['@lynx-js/webpack-runtime-globals'].filename) {
			throw new Error(
				`@octanejs/rspeedy-plugin: duplicate @lynx-js/webpack-runtime-globals instances detected (${packages['@lynx-js/webpack-runtime-globals'].filename} and ${runtimeGlobals.filename}). Install one supported atomic compatibility lane.`,
			);
		}
	}
	return Object.freeze(
		Object.fromEntries(
			Object.entries(packages).map(([name, value]) => [
				name,
				Object.freeze({ path: value.filename, version: value.version }),
			]),
		),
	);
}
