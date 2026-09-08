import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import semver from 'semver';
import { OCTANE_BETA_PEER_RANGE, validateWorkspacePackages } from './workspace-packages.mjs';

function workspacePackage(name, manifest = {}) {
	return {
		dir: name.replaceAll('/', '-'),
		directory: '/fixture',
		manifest: { name, private: true, ...manifest },
		name,
		private: true,
		role: 'other package',
		statusPath: '/fixture/status.json',
		version: '0.0.0',
	};
}

test('accepts the coordinated Octane alpha/beta peer range', () => {
	const errors = validateWorkspacePackages([
		workspacePackage('octane'),
		workspacePackage('@octanejs/example', {
			peerDependencies: { octane: OCTANE_BETA_PEER_RANGE },
		}),
	]);

	assert.deepEqual(errors, []);
});

test('rejects an Octane peer range that can recreate major dependent releases', () => {
	const errors = validateWorkspacePackages([
		workspacePackage('octane'),
		workspacePackage('@octanejs/example', {
			peerDependencies: { octane: 'workspace:*' },
		}),
	]);

	assert.deepEqual(errors, [
		'packages/@octanejs-example peerDependencies.octane must be "workspace:^0.1.51 || ^0.2.0" (received "workspace:*")',
	]);
});

for (const name of ['base-ui', 'base-ui-utils', 'shadcn', 'testing-library']) {
	test(`${name} excludes runtimes without its compiler and act prerequisites`, () => {
		const manifest = JSON.parse(
			readFileSync(new URL(`../packages/${name}/package.json`, import.meta.url)),
		);
		const range = manifest.peerDependencies.octane.replace(/^workspace:/, '');
		assert.equal(semver.satisfies('0.1.51', range), false);
		assert.equal(semver.satisfies('0.2.3', range), false);
		assert.equal(semver.satisfies('0.2.4', range), false);
		assert.equal(semver.satisfies('0.2.5', range), true);
		assert.equal(semver.satisfies('0.3.0', range), false);
		const correct = workspacePackage(manifest.name, {
			peerDependencies: { octane: manifest.peerDependencies.octane },
		});
		assert.deepEqual(validateWorkspacePackages([workspacePackage('octane'), correct]), []);
		const legacy = workspacePackage(manifest.name, {
			peerDependencies: { octane: OCTANE_BETA_PEER_RANGE },
		});
		assert.ok(
			validateWorkspacePackages([workspacePackage('octane'), legacy]).some((error) =>
				error.includes('peerDependencies.octane'),
			),
		);
	});
}
