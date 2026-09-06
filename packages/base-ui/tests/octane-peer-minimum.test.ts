import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { satisfies } from 'semver';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilsManifestPath = resolve(packageDirectory, '../base-ui-utils/package.json');

function publishedOctanePeer(manifestPath: string): string {
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
		peerDependencies?: { octane?: string };
	};
	const workspaceRange = manifest.peerDependencies?.octane;
	expect(workspaceRange).toMatch(/^workspace:/);
	return workspaceRange!.replace(/^workspace:/, '');
}

describe('@octanejs/base-ui Octane peer minimum', function () {
	it('requires the Octane release that compiles Base UI 1.8 method hooks', function () {
		const range = publishedOctanePeer(resolve(packageDirectory, 'package.json'));
		expect(satisfies('0.2.3', range)).toBe(false);
		expect(satisfies('0.2.4', range)).toBe(true);
	});

	it('keeps @octanejs/base-ui-utils on the same Octane floor', function () {
		const range = publishedOctanePeer(utilsManifestPath);
		expect(satisfies('0.2.3', range)).toBe(false);
		expect(satisfies('0.2.4', range)).toBe(true);
	});
});
