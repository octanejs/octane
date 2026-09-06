// @vitest-environment node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { satisfies } from 'semver';
import { describe, expect, it } from 'vitest';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const declaredMinimumOctane = resolve(packageDirectory, '../octane/src/index.ts');
const missingActScopeStandin = resolve(
	packageDirectory,
	'tests/_fixtures/octane-without-act-scope.ts',
);
const testingLibraryPure = resolve(packageDirectory, 'src/pure.ts');

function publishedOctanePeerRange(): string {
	const manifest = JSON.parse(readFileSync(resolve(packageDirectory, 'package.json'), 'utf8')) as {
		peerDependencies?: { octane?: string };
	};
	const workspaceRange = manifest.peerDependencies?.octane;
	expect(workspaceRange).toMatch(/^workspace:/);
	return workspaceRange!.replace(/^workspace:/, '');
}

async function bundleTestingLibraryAgainst(octaneEntry: string): Promise<string> {
	const result = await build({
		absWorkingDir: packageDirectory,
		alias: {
			octane: octaneEntry,
		},
		bundle: true,
		entryPoints: [testingLibraryPure],
		external: ['@testing-library/dom'],
		format: 'esm',
		logLevel: 'silent',
		platform: 'neutral',
		write: false,
	});
	return result.outputFiles[0].text;
}

describe('@octanejs/testing-library Octane peer minimum', function () {
	it('excludes published Octane 0.2.3, which has no isInActScope export', function () {
		const range = publishedOctanePeerRange();
		expect(satisfies('0.2.3', range)).toBe(false);
		expect(satisfies('0.2.4', range)).toBe(true);
	});

	it('bundles the pure entry against the declared-minimum Octane that exports isInActScope', async function () {
		const code = await bundleTestingLibraryAgainst(declaredMinimumOctane);
		expect(code).toContain('isInActScope');
		expect(code.length).toBeGreaterThan(0);
	});

	it('fails to bundle against a 0.2.3-shaped Octane that omits isInActScope', async function () {
		await expect(bundleTestingLibraryAgainst(missingActScopeStandin)).rejects.toThrow(
			/isInActScope/,
		);
	});

	it('resolves isInActScope from the workspace Octane that publishes as the minimum', async function () {
		const octane = await import(declaredMinimumOctane);
		expect(typeof octane.isInActScope).toBe('function');
	});
});
