import { realpathSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const EXPECTED_VERSIONS = Object.freeze({
	'@lynx-js/rspeedy': '0.16.0',
	'@rsbuild/core': '2.1.4',
	'@rspack/core': '2.1.3',
});

function readPackage(request, packageName) {
	let filename;
	try {
		filename = request.resolve(`${packageName}/package.json`);
	} catch (error) {
		throw new Error(
			`@octanejs/rspeedy-plugin: cannot resolve required ${packageName} from the application. Install the exact Phase 1 compatibility set.`,
			{ cause: error },
		);
	}
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(filename, 'utf8'));
	} catch (error) {
		throw new Error(`@octanejs/rspeedy-plugin: cannot read ${filename}.`, { cause: error });
	}
	return {
		filename: realpathSync(filename),
		version: manifest.version,
	};
}

/**
 * Validate the exact, single Rspeedy/Rsbuild/Rspack graph proven by Phase 0.
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
	};
	for (const [name, expected] of Object.entries(EXPECTED_VERSIONS)) {
		if (packages[name].version !== expected) {
			throw new Error(
				`@octanejs/rspeedy-plugin: ${name}@${packages[name].version} is incompatible; Phase 1 requires exactly ${name}@${expected}.`,
			);
		}
	}
	for (const name of ['@rsbuild/core', '@rspack/core']) {
		const fromRspeedy = readPackage(rspeedyRequire, name);
		if (fromRspeedy.filename !== packages[name].filename) {
			throw new Error(
				`@octanejs/rspeedy-plugin: duplicate ${name} instances detected (${packages[name].filename} and ${fromRspeedy.filename}). Install the exact compatibility set in one physical dependency graph.`,
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
