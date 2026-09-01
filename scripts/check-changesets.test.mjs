import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { computedMajorReleaseNames, majorReleaseNames } from './check-release-plan.mjs';

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

test('keeps other 0.x packages on the patch track', () => {
	const result = runChecker({
		'binding.md': "---\n'@octanejs/vite-plugin': minor\n---\n\nUnexpected minor.\n",
	});

	assert.equal(result.status, 1);
	assert.match(result.stderr, /@octanejs\/vite-plugin: minor/);
	assert.match(result.stderr, /Only the core "octane" package may use "minor"/);
});

test('continues to reject major bumps for every package', () => {
	const result = runChecker({
		'major.md': "---\n'octane': major\n---\n\nUnexpected major.\n",
	});

	assert.equal(result.status, 1);
	assert.match(result.stderr, /octane: major/);
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
