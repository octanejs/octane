import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getReleasePlan } from '@changesets/get-release-plan';
import { computedMajorReleaseNames, majorReleaseNames } from './check-release-plan.mjs';
import {
	getWorkspacePackages,
	publishedOctanePeerRangeFor,
	validateWorkspacePackages,
} from './workspace-packages.mjs';

const checker = new URL('./check-changesets.js', import.meta.url);

function runChecker(changesets) {
	const directory = mkdtempSync(join(tmpdir(), 'octane-changesets-'));
	const changesetDirectory = join(directory, '.changeset');
	const scriptDirectory = join(directory, 'scripts');

	try {
		mkdirSync(changesetDirectory);
		mkdirSync(scriptDirectory);
		copyFileSync(checker, join(scriptDirectory, 'check-changesets.js'));
		writeFileSync(join(directory, 'package.json'), '{"type":"module"}\n');

		for (const [name, content] of Object.entries(changesets)) {
			writeFileSync(join(changesetDirectory, name), content);
		}

		return spawnSync(process.execPath, ['scripts/check-changesets.js'], {
			cwd: directory,
			encoding: 'utf8',
		});
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
}

test('allows a coordinated minor bump for the core beta line', () => {
	const result = runChecker({
		'beta.md':
			"---\n'octane': minor\n'@octanejs/vite-plugin': patch\n---\n\nPromote Octane to beta.\n",
	});

	assert.equal(result.status, 0, result.stderr);
});

test('allows minor bumps for bindings and tooling alongside patch releases', () => {
	const result = runChecker({
		'binding.md':
			"---\n'@octanejs/floating-ui': minor\n'@octanejs/vite-plugin': minor\n'@octanejs/app-core': patch\n---\n\nAdd features.\n",
	});

	assert.equal(result.status, 0, result.stderr);
});

test('continues to reject major bumps for every package', () => {
	const result = runChecker({
		'major.md': "---\n'octane': major\n'@octanejs/vite-plugin': major\n---\n\nUnexpected major.\n",
	});

	assert.equal(result.status, 1);
	assert.match(result.stderr, /octane: major/);
	assert.match(result.stderr, /@octanejs\/vite-plugin: major/);
	assert.match(result.stderr, /"major" changesets are not allowed/);
});

test('finds major bumps introduced by the computed release plan', () => {
	assert.deepEqual(
		majorReleaseNames([
			{ name: 'octane', type: 'minor' },
			{ name: '@octanejs/vite-plugin', type: 'major' },
			{ name: '@octanejs/app-core', type: 'patch' },
		]),
		['@octanejs/vite-plugin'],
	);
});

test('reads every pending changeset without a Git comparison ref', async () => {
	const calls = [];
	const majors = await computedMajorReleaseNames('/repo', (...args) => {
		calls.push(args);
		return Promise.resolve({ releases: [{ name: '@octanejs/widget', type: 'major' }] });
	});

	assert.deepEqual(calls, [['/repo']]);
	assert.deepEqual(majors, ['@octanejs/widget']);
});

for (const source of ['octane', '@octanejs/floating-ui']) {
	test(`${source} minor release patch-bumps out-of-range peer dependents`, async () => {
		const directory = mkdtempSync(join(tmpdir(), 'octane-release-plan-'));
		try {
			mkdirSync(join(directory, '.changeset'));
			writeFileSync(
				join(directory, 'package.json'),
				JSON.stringify({ name: 'fixture', private: true }),
			);
			writeFileSync(join(directory, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
			const config = JSON.parse(
				readFileSync(new URL('../.changeset/config.json', import.meta.url), 'utf8'),
			);
			writeFileSync(
				join(directory, '.changeset/config.json'),
				JSON.stringify({ ...config, changelog: false, format: false }),
			);
			const manifests = {
				source: { name: source, version: '0.2.5' },
				peer: {
					name: '@octanejs/peer',
					version: '0.1.7',
					peerDependencies: { [source]: 'workspace:^0.2.5' },
				},
				compatible: {
					name: '@octanejs/compatible',
					version: '0.1.7',
					peerDependencies: { [source]: 'workspace:>=0.2.5 <1' },
				},
			};
			for (const [name, manifest] of Object.entries(manifests)) {
				mkdirSync(join(directory, 'packages', name), { recursive: true });
				writeFileSync(join(directory, 'packages', name, 'package.json'), JSON.stringify(manifest));
			}
			writeFileSync(
				join(directory, '.changeset/minor.md'),
				`---\n"${source}": minor\n"@octanejs/compatible": patch\n---\n\nAdd a feature.\n`,
			);

			const plan = await getReleasePlan(directory);
			assert.deepEqual(
				plan.releases
					.map(({ name, type, newVersion }) => ({ name, type, newVersion }))
					.sort((a, b) => a.name.localeCompare(b.name)),
				[
					{ name: source, type: 'minor', newVersion: '0.3.0' },
					{ name: '@octanejs/peer', type: 'patch', newVersion: '0.1.8' },
					{ name: '@octanejs/compatible', type: 'patch', newVersion: '0.1.8' },
				].sort((a, b) => a.name.localeCompare(b.name)),
			);
			assert.deepEqual(await computedMajorReleaseNames(directory), []);

			const version = spawnSync(
				process.execPath,
				[fileURLToPath(import.meta.resolve('@changesets/cli/bin.js')), 'version'],
				{ cwd: directory, encoding: 'utf8' },
			);
			assert.equal(version.status, 0, version.stderr);
			const readManifest = (name) =>
				JSON.parse(readFileSync(join(directory, 'packages', name, 'package.json'), 'utf8'));
			assert.equal(readManifest('source').version, '0.3.0');
			assert.equal(readManifest('peer').version, '0.1.8');
			assert.equal(readManifest('peer').peerDependencies[source], 'workspace:^0.3.0');
			assert.deepEqual(readManifest('compatible'), { ...manifests.compatible, version: '0.1.8' });
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
}

test('successive Octane releases retain valid workspace and published peer contracts', async (t) => {
	const directory = mkdtempSync(join(tmpdir(), 'octane-release-peers-'));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	mkdirSync(join(directory, '.changeset'));
	writeFileSync(
		join(directory, 'package.json'),
		JSON.stringify({ name: 'fixture', private: true }),
	);
	writeFileSync(join(directory, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
	const config = JSON.parse(readFileSync(new URL('../.changeset/config.json', import.meta.url)));
	writeFileSync(
		join(directory, '.changeset/config.json'),
		JSON.stringify({ ...config, changelog: false, format: false }),
	);
	for (const [dir, name, peer] of [
		['octane', 'octane', undefined],
		['widget', '@octanejs/widget', 'workspace:^0.1.51 || ^0.2.0 || ^0.3.0'],
		['base-ui-utils', '@octanejs/base-ui-utils', 'workspace:^0.2.5 || ^0.3.0'],
		['floating-ui', '@octanejs/floating-ui', 'workspace:^0.3.7'],
		['drei', '@octanejs/drei', 'workspace:^'],
	]) {
		const packageDirectory = join(directory, 'packages', dir);
		mkdirSync(packageDirectory, { recursive: true });
		writeFileSync(
			join(packageDirectory, 'package.json'),
			JSON.stringify({
				name,
				version: name === 'octane' ? '0.3.6' : '0.1.0',
				engines: { node: '>=22.22.2' },
				publishConfig: { access: 'public' },
				repository: { directory: `packages/${dir}` },
				...(peer && {
					peerDependencies: { octane: peer },
					devDependencies: { octane: 'workspace:*' },
				}),
			}),
		);
		writeFileSync(join(packageDirectory, 'status.json'), '{}');
		writeFileSync(join(packageDirectory, 'README.md'), `npm install ${name}\npnpm add ${name}\n`);
	}
	assert.deepEqual(validateWorkspacePackages(getWorkspacePackages(directory)), []);
	for (const [bump, version, explicitPeer] of [
		['minor', '0.4.0', 'workspace:^0.4.0'],
		['patch', '0.4.1', 'workspace:^0.4.0'],
		['minor', '0.5.0', 'workspace:^0.5.0'],
	]) {
		writeFileSync(
			join(directory, '.changeset/release.md'),
			`---\n"octane": ${bump}\n"@octanejs/widget": patch\n"@octanejs/base-ui-utils": patch\n"@octanejs/floating-ui": patch\n"@octanejs/drei": patch\n---\n\nRelease the next core version.\n`,
		);
		assert.deepEqual(await computedMajorReleaseNames(directory), []);
		const result = spawnSync(
			process.execPath,
			[fileURLToPath(import.meta.resolve('@changesets/cli/bin.js')), 'version'],
			{ cwd: directory, encoding: 'utf8' },
		);
		assert.equal(result.status, 0, result.stderr);
		const packages = getWorkspacePackages(directory);
		assert.equal(packages.find((pkg) => pkg.name === 'octane').version, version);
		assert.deepEqual(validateWorkspacePackages(packages), [], `after releasing ${version}`);
		for (const pkg of packages.filter((pkg) => pkg.name !== 'octane')) {
			const coordinated = pkg.name === '@octanejs/drei';
			assert.equal(
				pkg.manifest.peerDependencies.octane,
				coordinated ? 'workspace:^' : explicitPeer,
			);
			assert.equal(
				publishedOctanePeerRangeFor(pkg.name, version),
				coordinated ? `^${version}` : explicitPeer.replace('workspace:', ''),
			);
		}
	}
});

test('versioning multiline release notes produces whitespace-clean changelogs', () => {
	const directory = mkdtempSync(join(tmpdir(), 'octane-version-changelog-'));
	try {
		mkdirSync(join(directory, '.changeset'));
		mkdirSync(join(directory, 'packages/demo'), { recursive: true });
		writeFileSync(
			join(directory, 'package.json'),
			JSON.stringify({ name: 'fixture', private: true }),
		);
		writeFileSync(join(directory, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
		writeFileSync(
			join(directory, 'packages/demo/package.json'),
			JSON.stringify({ name: 'demo', version: '0.1.0' }),
		);
		writeFileSync(
			join(directory, '.changeset/config.json'),
			JSON.stringify({
				...JSON.parse(readFileSync(new URL('../.changeset/config.json', import.meta.url), 'utf8')),
				changelog: fileURLToPath(import.meta.resolve('@changesets/changelog-git')),
			}),
		);
		writeFileSync(
			join(directory, '.changeset/fix.md'),
			'---\n"demo": patch\n---\n\nFirst paragraph.\n\nSecond paragraph.\n',
		);
		writeFileSync(
			join(directory, 'packages/demo/CHANGELOG.md'),
			'# demo\n\n## 0.1.0\n\n- Existing note.  \n  Intentional Markdown line break.\n',
		);
		for (const args of [
			['init', '-b', 'main'],
			['add', '.'],
			['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'fixture'],
		]) {
			const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
			assert.equal(result.status, 0, result.stderr);
		}
		const version = spawnSync(
			process.execPath,
			[fileURLToPath(import.meta.resolve('@changesets/cli/bin.js')), 'version'],
			{ cwd: directory, encoding: 'utf8' },
		);
		assert.equal(version.status, 0, version.stderr);
		const normalization = spawnSync(
			process.execPath,
			[fileURLToPath(new URL('./normalize-changelogs.mjs', import.meta.url))],
			{ cwd: directory, encoding: 'utf8' },
		);
		assert.equal(normalization.status, 0, normalization.stderr);
		const changelogPath = join(directory, 'packages/demo/CHANGELOG.md');
		const changelog = readFileSync(changelogPath, 'utf8');
		assert.match(changelog, /Second paragraph/);
		assert.match(changelog, /Existing note\.  \n/);
		const check = spawnSync('git', ['diff', '--check'], { cwd: directory, encoding: 'utf8' });
		assert.equal(check.status, 0, check.stdout);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
