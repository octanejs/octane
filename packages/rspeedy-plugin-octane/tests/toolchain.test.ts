import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assertLynxToolchain } from '../src/index.js';

const temporaryRoots: string[] = [];

function writePackage(directory: string, name: string, version: string): string {
	const packageRoot = join(directory, 'node_modules', ...name.split('/'));
	mkdirSync(packageRoot, { recursive: true });
	writeFileSync(
		join(packageRoot, 'package.json'),
		JSON.stringify({ name, version, type: 'module' }),
		'utf8',
	);
	return packageRoot;
}

function createToolchain(): string {
	const root = mkdtempSync(join(tmpdir(), 'octane-lynx-toolchain-'));
	temporaryRoots.push(root);
	writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true }), 'utf8');
	writePackage(root, '@lynx-js/rspeedy', '0.16.0');
	writePackage(root, '@rsbuild/core', '2.1.4');
	writePackage(root, '@rspack/core', '2.1.3');
	return root;
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Phase 1 Lynx toolchain guard', () => {
	it('accepts the exact single physical compatibility graph', () => {
		const result = assertLynxToolchain(createToolchain());

		expect(result['@lynx-js/rspeedy'].version).toBe('0.16.0');
		expect(result['@rsbuild/core'].version).toBe('2.1.4');
		expect(result['@rspack/core'].version).toBe('2.1.3');
	});

	it('rejects a version that was not proven by Phase 0', () => {
		const root = createToolchain();
		writePackage(root, '@rsbuild/core', '2.1.5');

		expect(() => assertLynxToolchain(root)).toThrow(/@rsbuild\/core@2\.1\.5.*exactly/);
	});

	it('rejects a second core resolved only from Rspeedy', () => {
		const root = createToolchain();
		const rspeedy = join(root, 'node_modules', '@lynx-js', 'rspeedy');
		writePackage(rspeedy, '@rspack/core', '2.1.3');

		expect(() => assertLynxToolchain(root)).toThrow(/duplicate @rspack\/core instances/);
	});
});
