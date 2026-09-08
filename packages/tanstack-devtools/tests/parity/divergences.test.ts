import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const packageRoot = resolve(root, 'packages/tanstack-devtools');
const crosswalk = JSON.parse(
	readFileSync(resolve(root, 'packages/tanstack-devtools/audit/upstream-crosswalk.json'), 'utf8'),
);
const octaneIndex = readFileSync(resolve(root, 'packages/tanstack-devtools/src/index.ts'), 'utf8');
const octanePackage = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));

function readInstalledPackage(name: string) {
	const candidates = [
		resolve(packageRoot, 'node_modules', name, 'package.json'),
		resolve(root, 'node_modules', name, 'package.json'),
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) return JSON.parse(readFileSync(candidate, 'utf8'));
	}
	throw new Error(`could not locate installed package.json for ${name}`);
}

const upstreamReactDevtools = readInstalledPackage('@tanstack/react-devtools');
const octaneCore = readInstalledPackage('@tanstack/devtools');

describe('@octanejs/tanstack-devtools divergence contracts', function divergenceSuite() {
	// @parity-case conformance:tanstack-devtools-core-version
	it('records the framework-neutral core version drift', function coreVersion() {
		const upstreamVersion = upstreamReactDevtools.dependencies['@tanstack/devtools'];
		const octaneVersion = octaneCore.version;
		expect(typeof upstreamVersion).toBe('string');
		expect(upstreamVersion.length).toBeGreaterThan(0);
		expect(octanePackage.dependencies['@tanstack/devtools']).toMatch(/^catalog:/);
		expect(octaneVersion).toMatch(/^\d+\.\d+\.\d+/);
		expect(crosswalk.coreDependency).toEqual({
			upstreamVersion,
			octaneVersion,
			disposition: 'version-divergence',
		});
	});

	// @parity-case conformance:tanstack-devtools-octane-type-names
	it('records the Octane-prefixed public adapter type names', function typeNames() {
		expect(octaneIndex).toContain('TanStackDevtoolsOctanePlugin');
		expect(octaneIndex).toContain('TanStackDevtoolsOctaneInit');
		expect(crosswalk.exports).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'TanStackDevtoolsReactPlugin',
					octaneExport: 'TanStackDevtoolsOctanePlugin',
					disposition: 'renamed-divergence',
				}),
				expect.objectContaining({
					name: 'TanStackDevtoolsReactInit',
					octaneExport: 'TanStackDevtoolsOctaneInit',
					disposition: 'renamed-divergence',
				}),
			]),
		);
	});

	// @parity-case conformance:tanstack-devtools-extra-core-reexports
	it('records the additional framework-neutral core re-exports', function coreReexports() {
		expect(octaneIndex).toContain('TanStackDevtoolsCore');
		expect(octaneIndex).toContain('PLUGIN_CONTAINER_ID');
		expect(crosswalk.octaneAdditiveExports).toEqual(
			expect.objectContaining({
				disposition: 'additive-divergence',
				divergenceId: 'extra-core-reexports',
			}),
		);
	});
});
