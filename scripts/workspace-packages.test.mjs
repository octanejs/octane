import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import semver from 'semver';
import {
	getBindingPackages,
	getFrameworkIntegrationPackages,
	getPublishablePackages,
	getWorkspacePackages,
	OCTANE_BETA_PEER_RANGE,
	REPO_ROOT,
	validateWorkspacePackages,
} from './workspace-packages.mjs';

test('explicit-root discovery uses only packages in the audited checkout', (t) => {
	const root = mkdtempSync(path.join(tmpdir(), 'workspace-discovery-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const [dir, name, privatePackage] of [
		['only-here', '@octanejs/only-here', false],
		['internal', '@octanejs/internal', true],
		['astro', '@octanejs/astro', false],
	]) {
		const directory = path.join(root, 'packages', dir);
		mkdirSync(directory, { recursive: true });
		writeFileSync(
			path.join(directory, 'package.json'),
			JSON.stringify({ name, version: '1.0.0', private: privatePackage }),
		);
	}
	assert.deepEqual(
		getWorkspacePackages(root).map((pkg) => pkg.name),
		['@octanejs/astro', '@octanejs/internal', '@octanejs/only-here'],
	);
	assert.deepEqual(
		getPublishablePackages(root).map((pkg) => pkg.name),
		['@octanejs/astro', '@octanejs/only-here'],
	);
	assert.deepEqual(
		getBindingPackages(root).map((pkg) => pkg.name),
		['@octanejs/only-here'],
	);
	assert.deepEqual(
		getFrameworkIntegrationPackages(root).map((pkg) => pkg.name),
		['@octanejs/astro'],
	);
	assert.equal(getBindingPackages(root)[0].directory, path.join(root, 'packages/only-here'));
	assert.deepEqual(getWorkspacePackages(), getWorkspacePackages(REPO_ROOT));
});

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
