import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

test('discovery rejects package metadata outside the inspected checkout', (t) => {
	const temporary = mkdtempSync(path.join(tmpdir(), 'workspace-confinement-'));
	t.after(() => rmSync(temporary, { recursive: true, force: true }));
	const root = path.join(temporary, 'checkout');
	const outside = path.join(temporary, 'outside');
	mkdirSync(path.join(outside, 'fixture'), { recursive: true });
	writeFileSync(
		path.join(outside, 'fixture/package.json'),
		JSON.stringify({ name: '@octanejs/outside-canary' }),
	);
	mkdirSync(root);
	symlinkSync(outside, path.join(root, 'packages'), 'dir');
	assert.throws(() => getWorkspacePackages(root), /packages.*(?:escape|outside)/i);

	rmSync(path.join(root, 'packages'));
	mkdirSync(path.join(root, 'packages/fixture'), { recursive: true });
	symlinkSync(
		path.join(outside, 'fixture/package.json'),
		path.join(root, 'packages/fixture/package.json'),
	);
	assert.throws(() => getWorkspacePackages(root), /package\.json.*(?:escape|outside)/i);
});

test('malformed manifests report their path without copying JSON contents', (t) => {
	const root = mkdtempSync(path.join(tmpdir(), 'workspace-malformed-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(path.join(root, 'packages/fixture'), { recursive: true });
	writeFileSync(path.join(root, 'packages/fixture/package.json'), 'HARMLESS_MANIFEST_CANARY');
	assert.throws(
		() => getWorkspacePackages(root),
		(error) => {
			assert.match(error.message, /packages\/fixture\/package\.json/);
			assert.doesNotMatch(error.message, /HARMLESS|MANIFEST_CANARY/);
			return true;
		},
	);
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
