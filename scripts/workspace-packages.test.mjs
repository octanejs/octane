import assert from 'node:assert/strict';
import test from 'node:test';
import {
	OCTANE_BETA_PEER_RANGE,
	OCTANE_CURRENT_PEER_RANGE,
	validateWorkspacePackages,
} from './workspace-packages.mjs';

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

test('requires the current Octane floor for packages that import post-0.2.3 APIs', () => {
	const errors = validateWorkspacePackages([
		workspacePackage('octane'),
		workspacePackage('@octanejs/testing-library', {
			peerDependencies: { octane: OCTANE_BETA_PEER_RANGE },
		}),
	]);

	assert.deepEqual(errors, [
		'packages/@octanejs-testing-library peerDependencies.octane must be "workspace:^0.2.4" (received "workspace:^0.1.51 || ^0.2.0")',
	]);
});

test('accepts the current Octane floor for testing-library and Base UI', () => {
	const errors = validateWorkspacePackages([
		workspacePackage('octane'),
		workspacePackage('@octanejs/testing-library', {
			peerDependencies: { octane: OCTANE_CURRENT_PEER_RANGE },
		}),
		workspacePackage('@octanejs/base-ui', {
			peerDependencies: { octane: OCTANE_CURRENT_PEER_RANGE },
		}),
		workspacePackage('@octanejs/base-ui-utils', {
			peerDependencies: { octane: OCTANE_CURRENT_PEER_RANGE },
		}),
	]);

	assert.deepEqual(errors, []);
});
