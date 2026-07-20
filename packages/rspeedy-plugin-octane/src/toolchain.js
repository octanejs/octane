import { realpathSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const EXPECTED_VERSIONS = Object.freeze({
	'@lynx-js/rspeedy': '0.16.0',
	'@rsbuild/core': '2.1.4',
	'@rspack/core': '2.1.3',
});

const EXPECTED_PLUGIN_VERSIONS = Object.freeze({
	'@lynx-js/css-extract-webpack-plugin': '0.9.0',
	'@lynx-js/runtime-wrapper-webpack-plugin': '0.2.2',
	'@lynx-js/template-webpack-plugin': '0.13.0',
	'@lynx-js/webpack-dev-transport': '0.3.0',
});

const EXPECTED_TEMPLATE_DEPENDENCIES = Object.freeze({
	'@lynx-js/tasm': Object.freeze({ request: '0.0.39', version: '0.0.39' }),
	'@lynx-js/web-core': Object.freeze({ request: '0.22.2', version: '0.22.2' }),
	'@lynx-js/webpack-runtime-globals': Object.freeze({ request: '^0.0.7', version: '0.0.7' }),
});

const pluginRequire = createRequire(import.meta.url);

function readPackage(request, packageName) {
	let filename;
	try {
		filename = request.resolve(`${packageName}/package.json`);
	} catch (error) {
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
		if (filename === undefined) {
			throw new Error(
				`@octanejs/rspeedy-plugin: cannot resolve required ${packageName}. Install the exact Milestone 5 compatibility set.`,
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
 * Validate the exact Rspeedy core and framework-neutral plugin graph used by
 * Milestone 5, extending the core identity checks proven by Phase 0.
 *
 * Rspeedy and the application must resolve the same physical Rsbuild and
 * Rspack packages. Two compatible-looking instances still carry distinct
 * plugin classes, hooks, and compiler state, so accepting them is unsafe.
 */
export function assertLynxToolchain(root) {
	const appRequire = createRequire(join(root, 'package.json'));
	const rspeedy = readPackage(appRequire, '@lynx-js/rspeedy');
	const rspeedyRequire = createRequire(rspeedy.filename);
	const packages = {
		'@lynx-js/rspeedy': rspeedy,
		'@rsbuild/core': readPackage(appRequire, '@rsbuild/core'),
		'@rspack/core': readPackage(appRequire, '@rspack/core'),
		...Object.fromEntries(
			Object.keys(EXPECTED_PLUGIN_VERSIONS).map((name) => [name, readPackage(pluginRequire, name)]),
		),
	};
	for (const [name, expected] of Object.entries({
		...EXPECTED_VERSIONS,
		...EXPECTED_PLUGIN_VERSIONS,
	})) {
		if (packages[name].version !== expected) {
			throw new Error(
				`@octanejs/rspeedy-plugin: ${name}@${packages[name].version} is incompatible; Milestone 5 requires exactly ${name}@${expected}.`,
			);
		}
	}
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
	for (const [name, expected] of Object.entries(EXPECTED_TEMPLATE_DEPENDENCIES)) {
		const requested = packages['@lynx-js/template-webpack-plugin'].dependencies[name];
		if (requested !== expected.request) {
			throw new Error(
				`@octanejs/rspeedy-plugin: @lynx-js/template-webpack-plugin requests ${name}@${String(requested)}; Milestone 5 requires ${name}@${expected.request}.`,
			);
		}
		const installed = readPackage(templateRequire, name);
		if (installed.version !== expected.version) {
			throw new Error(
				`@octanejs/rspeedy-plugin: @lynx-js/template-webpack-plugin resolves ${name}@${installed.version}; Milestone 5 requires exactly ${name}@${expected.version}.`,
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
	return Object.freeze(
		Object.fromEntries(
			Object.entries(packages).map(([name, value]) => [
				name,
				Object.freeze({ path: value.filename, version: value.version }),
			]),
		),
	);
}
