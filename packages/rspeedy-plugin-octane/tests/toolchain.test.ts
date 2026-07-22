import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assertLynxToolchain, LYNX_TOOLCHAIN_LANES } from '../src/index.js';

const temporaryRoots: string[] = [];
const testRequire = createRequire(import.meta.url);
const installedRspeedyRequire = createRequire(testRequire.resolve('@lynx-js/rspeedy/package.json'));
const RSPEEDY_BUILD_PACKAGES = [
	'@lynx-js/cache-events-webpack-plugin',
	'@lynx-js/chunk-loading-webpack-plugin',
	'@lynx-js/debug-metadata-rsbuild-plugin',
	'@lynx-js/web-rsbuild-server-middleware',
	'@lynx-js/webpack-dev-transport',
	'@lynx-js/websocket',
	'@rsbuild/plugin-css-minimizer',
	'@rsdoctor/rspack-plugin',
	'typescript',
	'webpack',
] as const;
const RSPEEDY_DEPENDENCIES = {
	'@lynx-js/cache-events-webpack-plugin': '^0.2.0',
	'@lynx-js/chunk-loading-webpack-plugin': '^0.4.1',
	'@lynx-js/debug-metadata-rsbuild-plugin': '^0.2.0',
	'@lynx-js/web-rsbuild-server-middleware': '0.22.2',
	'@lynx-js/webpack-dev-transport': '^0.3.0',
	'@lynx-js/websocket': '^0.0.4',
	'@rsbuild/core': '2.1.4',
	'@rsbuild/plugin-css-minimizer': '2.0.0',
	'@rsdoctor/rspack-plugin': '~1.5.6',
} as const;

function installedPackageRoot(request: NodeRequire, packageName: string): string {
	let filename: string;
	try {
		filename = request.resolve(`${packageName}/package.json`);
	} catch {
		let directory = dirname(request.resolve(packageName));
		while (true) {
			const candidate = join(directory, 'package.json');
			try {
				if (JSON.parse(readFileSync(candidate, 'utf8')).name === packageName) {
					filename = candidate;
					break;
				}
			} catch {
				// Keep walking from a package-internal entry to its manifest.
			}
			const parent = dirname(directory);
			if (parent === directory) throw new Error(`cannot find ${packageName}`);
			directory = parent;
		}
	}
	return dirname(realpathSync(filename));
}

function linkInstalledPackage(directory: string, packageName: string): void {
	const target = join(directory, 'node_modules', ...packageName.split('/'));
	mkdirSync(dirname(target), { recursive: true });
	symlinkSync(installedPackageRoot(installedRspeedyRequire, packageName), target, 'dir');
}

function writePackage(
	directory: string,
	name: string,
	version: string,
	extra: Record<string, unknown> = {},
): string {
	const packageRoot = join(directory, 'node_modules', ...name.split('/'));
	mkdirSync(packageRoot, { recursive: true });
	writeFileSync(
		join(packageRoot, 'package.json'),
		JSON.stringify({ name, version, type: 'module', ...extra }),
		'utf8',
	);
	return packageRoot;
}

function createToolchain(rspackVersion = '2.1.3'): string {
	const root = mkdtempSync(join(tmpdir(), 'octane-lynx-toolchain-'));
	temporaryRoots.push(root);
	writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true }), 'utf8');
	writePackage(root, '@lynx-js/rspeedy', '0.16.0', { dependencies: RSPEEDY_DEPENDENCIES });
	writePackage(root, '@rsbuild/core', '2.1.4');
	writePackage(root, '@rspack/core', rspackVersion);
	for (const packageName of RSPEEDY_BUILD_PACKAGES) linkInstalledPackage(root, packageName);
	return root;
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Milestone 9 Lynx toolchain guard', () => {
	it('publishes immutable minimum and current atomic lanes', () => {
		expect(LYNX_TOOLCHAIN_LANES.minimum.packages['@lynx-js/cache-events-webpack-plugin']).toBe(
			'0.2.0',
		);
		expect(LYNX_TOOLCHAIN_LANES.minimum.packages['@rspack/core']).toBe('2.1.3');
		expect(LYNX_TOOLCHAIN_LANES.current.packages['@rspack/core']).toBe('2.1.5');
		expect(LYNX_TOOLCHAIN_LANES.current.packages['@rsbuild/core']).toBe('2.1.4');
		expect(LYNX_TOOLCHAIN_LANES.current.packages['@lynx-js/tasm']).toBe('0.0.39');
		expect(LYNX_TOOLCHAIN_LANES.current.packages['@rsdoctor/rspack-plugin']).toBe('1.5.18');
		expect(LYNX_TOOLCHAIN_LANES.current.packages.webpack).toBe('5.108.4');
		expect(Object.isFrozen(LYNX_TOOLCHAIN_LANES.current.packages)).toBe(true);
	});

	it('accepts the minimum single physical compatibility graph', () => {
		const result = assertLynxToolchain(createToolchain(), 'minimum');

		expect(result['@lynx-js/rspeedy'].version).toBe('0.16.0');
		expect(result['@rsbuild/core'].version).toBe('2.1.4');
		expect(result['@rspack/core'].version).toBe('2.1.3');
		expect(result['@lynx-js/tasm'].version).toBe('0.0.39');
		expect(result['@lynx-js/web-core'].version).toBe('0.22.2');
		expect(result['@lynx-js/webpack-runtime-globals'].version).toBe('0.0.7');
	});

	it('accepts the current Rspack patch within Rsbuild 2.1.4 constraints', () => {
		const result = assertLynxToolchain(createToolchain('2.1.5'), 'current');

		expect(result['@lynx-js/rspeedy'].version).toBe('0.16.0');
		expect(result['@rsbuild/core'].version).toBe('2.1.4');
		expect(result['@rspack/core'].version).toBe('2.1.5');
	});

	it('rejects a cross-lane graph instead of mixing its packages', () => {
		expect(() => assertLynxToolchain(createToolchain('2.1.5'), 'minimum')).toThrow(
			/minimum.*@rspack\/core@2\.1\.3/,
		);
	});

	it('rejects a version outside every supported atomic lane', () => {
		const root = createToolchain();
		writePackage(root, '@rsbuild/core', '2.1.7');

		expect(() => assertLynxToolchain(root)).toThrow(
			/@rsbuild\/core@2\.1\.7.*supported atomic lanes/,
		);
	});

	it('rejects an unknown requested lane', () => {
		expect(() => assertLynxToolchain(createToolchain(), 'future' as never)).toThrow(
			/unknown Lynx toolchain lane "future"/,
		);
	});

	it('rejects a second core resolved only from Rspeedy', () => {
		const root = createToolchain();
		const rspeedy = join(root, 'node_modules', '@lynx-js', 'rspeedy');
		writePackage(rspeedy, '@rspack/core', '2.1.3');

		expect(() => assertLynxToolchain(root)).toThrow(/duplicate @rspack\/core instances/);
	});

	it('rejects a second development transport resolved only from Rspeedy', () => {
		const root = createToolchain();
		const rspeedy = join(root, 'node_modules', '@lynx-js', 'rspeedy');
		writePackage(rspeedy, '@lynx-js/webpack-dev-transport', '0.3.0');

		expect(() => assertLynxToolchain(root)).toThrow(
			/duplicate @lynx-js\/webpack-dev-transport instances/,
		);
	});
});
