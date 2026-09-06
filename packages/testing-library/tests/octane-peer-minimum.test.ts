// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { satisfies } from 'semver';
import { describe, expect, it } from 'vitest';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceOctane = resolve(packageDirectory, '../octane/src/index.ts');
const testingLibraryPure = resolve(packageDirectory, 'src/pure.ts');

// Published npm 0.2.4 is already on the registry without `isInActScope`.
// Integrity is the packument `dist.integrity` for
// https://registry.npmjs.org/octane/-/octane-0.2.4.tgz
const INCOMPATIBLE_PUBLISHED_VERSION = '0.2.4';
const INCOMPATIBLE_PUBLISHED_INTEGRITY =
	'sha512-syVXJ2lK9Yoe9Z6lj/t39V6/zzNVlD78OOvMQabhXUZhhs7GdCC6G631cq9ZI+HucDLnywBRGNaz5rxR+/llwA==';
const INCOMPATIBLE_PUBLISHED_TARBALL = `https://registry.npmjs.org/octane/-/octane-${INCOMPATIBLE_PUBLISHED_VERSION}.tgz`;

function publishedOctanePeerRange(): string {
	const manifest = JSON.parse(readFileSync(resolve(packageDirectory, 'package.json'), 'utf8')) as {
		peerDependencies?: { octane?: string };
	};
	const workspaceRange = manifest.peerDependencies?.octane;
	expect(workspaceRange).toMatch(/^workspace:/);
	return workspaceRange!.replace(/^workspace:/, '');
}

function verifySha512Integrity(bytes: Uint8Array, integrity: string): void {
	expect(integrity.startsWith('sha512-')).toBe(true);
	const digest = createHash('sha512').update(bytes).digest('base64');
	expect(`sha512-${digest}`).toBe(integrity);
}

async function extractPublishedOctaneEntry(version: string, integrity: string): Promise<string> {
	const cacheRoot = join(tmpdir(), 'octane-peer-minimum', `octane-${version}`);
	const entry = join(cacheRoot, 'package', 'dist', 'index.js');
	if (existsSync(entry)) {
		return entry;
	}
	mkdirSync(cacheRoot, { recursive: true });
	const response = await fetch(INCOMPATIBLE_PUBLISHED_TARBALL);
	if (!response.ok) {
		throw new Error(`download octane@${version} failed: ${response.status} ${response.statusText}`);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	verifySha512Integrity(bytes, integrity);
	const tarball = join(cacheRoot, `octane-${version}.tgz`);
	writeFileSync(tarball, bytes);
	execFileSync('tar', ['-xzf', tarball, '-C', cacheRoot]);
	if (!existsSync(entry)) {
		throw new Error(`octane@${version} tarball did not contain package/dist/index.js`);
	}
	return entry;
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
		// Published Octane's own npm dependencies are not under test; keep the
		// failure on the public octane export map.
		packages: 'external',
		format: 'esm',
		logLevel: 'silent',
		platform: 'neutral',
		write: false,
	});
	return result.outputFiles[0].text;
}

describe('@octanejs/testing-library Octane peer minimum', function () {
	it('excludes published Octane 0.2.4, which has no isInActScope export', function () {
		const range = publishedOctanePeerRange();
		expect(satisfies(INCOMPATIBLE_PUBLISHED_VERSION, range)).toBe(false);
		expect(satisfies('0.2.5', range)).toBe(true);
	});

	it('fails to bundle the pure entry against the published npm 0.2.4 tarball', async function () {
		const publishedEntry = await extractPublishedOctaneEntry(
			INCOMPATIBLE_PUBLISHED_VERSION,
			INCOMPATIBLE_PUBLISHED_INTEGRITY,
		);
		const publishedSource = readFileSync(publishedEntry, 'utf8');
		expect(publishedSource).not.toMatch(/isInActScope/);
		await expect(bundleTestingLibraryAgainst(publishedEntry)).rejects.toThrow(/isInActScope/);
	}, 30_000);

	it('bundles the pure entry against this workspace Octane that will publish as 0.2.5', async function () {
		const code = await bundleTestingLibraryAgainst(workspaceOctane);
		expect(code).toContain('isInActScope');
		expect(code.length).toBeGreaterThan(0);
	});

	it('resolves isInActScope from the workspace Octane that publishes as the new floor', async function () {
		const octane = await import(workspaceOctane);
		expect(typeof octane.isInActScope).toBe('function');
	});
});
