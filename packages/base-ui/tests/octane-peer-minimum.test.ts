import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gt, inc, major, satisfies } from 'semver';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilsManifestPath = resolve(packageDirectory, '../base-ui-utils/package.json');
const octaneVersion: string = JSON.parse(
	readFileSync(resolve(packageDirectory, '../octane/package.json'), 'utf8'),
).version;

function publishedOctanePeer(manifestPath: string): string {
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
		peerDependencies?: { octane?: string };
	};
	const workspaceRange = manifest.peerDependencies?.octane;
	expect(workspaceRange).toMatch(/^workspace:/);
	return workspaceRange!.replace(/^workspace:/, '');
}

describe('@octanejs/base-ui Octane peer minimum', function () {
	it('requires the Octane release that provides deferred resize observers', function () {
		const range = publishedOctanePeer(resolve(packageDirectory, 'package.json'));
		expect(satisfies('0.2.3', range)).toBe(false);
		expect(satisfies('0.2.4', range)).toBe(false);
		expect(satisfies('0.2.5', range)).toBe(false);
		expect(satisfies('0.3.0', range)).toBe(false);
		expect(satisfies('0.3.6', range)).toBe(false);
		// Source may require an API scheduled for the next patch. After a minor
		// release, Changesets legitimately drops support for the previous line.
		const supportedVersion = gt(octaneVersion, '0.3.7') ? octaneVersion : '0.3.7';
		expect(satisfies(supportedVersion, range)).toBe(true);
		expect(satisfies(inc(supportedVersion, 'patch')!, range)).toBe(true);
		const nextBreaking = inc(supportedVersion, major(supportedVersion) === 0 ? 'minor' : 'major')!;
		expect(satisfies(nextBreaking, range)).toBe(false);
	});

	it('excludes incompatible runtimes from @octanejs/base-ui-utils while accepting the current release', function () {
		const range = publishedOctanePeer(utilsManifestPath);
		expect(satisfies('0.2.3', range)).toBe(false);
		expect(satisfies('0.2.4', range)).toBe(false);
		expect(satisfies(octaneVersion, range)).toBe(true);
	});
});
