import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
	compareSemver,
	inspectNpmReleaseState,
	releaseStateErrors,
} from './npm-release-preflight.mjs';
import { isolatePendingChangesets } from './prepare-changesets-publish.mjs';

function registryFixture(packages) {
	return async (url) => {
		const name = decodeURIComponent(new URL(url).pathname.slice(1));
		const metadata = packages[name];
		if (metadata === undefined) {
			return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
		}
		if (metadata instanceof Error) throw metadata;
		return { ok: true, status: 200, json: async () => metadata };
	};
}

function metadata(latest, versions) {
	return {
		'dist-tags': { latest },
		versions: Object.fromEntries(versions.map((version) => [version, {}])),
	};
}

describe('npm release preflight', () => {
	test('treats exact registry versions as already published', async () => {
		const state = await inspectNpmReleaseState(
			[
				{ name: 'octane', version: '0.1.16' },
				{ name: '@octanejs/app-core', version: '0.0.12' },
			],
			{
				fetchImpl: registryFixture({
					octane: metadata('0.1.16', ['0.1.15', '0.1.16']),
					'@octanejs/app-core': metadata('0.0.13', ['0.0.12', '0.0.13']),
				}),
			},
		);

		assert.deepEqual(
			state.published.map((pkg) => `${pkg.name}@${pkg.version}`),
			['@octanejs/app-core@0.0.12', 'octane@0.1.16'],
		);
		assert.deepEqual(state.pending, []);
		assert.deepEqual(releaseStateErrors(state), []);
	});

	test('reconciles unpublished versions after a later successful main build', async () => {
		const state = await inspectNpmReleaseState(
			[
				{ name: 'octane', version: '0.1.16' },
				{ name: '@octanejs/app-core', version: '0.0.12' },
			],
			{
				fetchImpl: registryFixture({
					octane: metadata('0.1.13', ['0.1.13']),
					'@octanejs/app-core': metadata('0.0.9', ['0.0.9']),
				}),
			},
		);

		assert.deepEqual(
			state.pending.map((pkg) => `${pkg.name}@${pkg.version}`),
			['@octanejs/app-core@0.0.12', 'octane@0.1.16'],
		);
		assert.deepEqual(releaseStateErrors(state), []);
	});

	test('blocks the complete release before an unbootstrapped package can cause a partial publish', async () => {
		const state = await inspectNpmReleaseState(
			[
				{ name: 'octane', version: '0.1.16' },
				{ name: '@octanejs/tanstack-hotkeys', version: '0.0.5' },
			],
			{ fetchImpl: registryFixture({ octane: metadata('0.1.13', ['0.1.13']) }) },
		);

		assert.deepEqual(
			state.unbootstrapped.map((pkg) => `${pkg.name}@${pkg.version}`),
			['@octanejs/tanstack-hotkeys@0.0.5'],
		);
		assert.match(releaseStateErrors(state)[0], /one-time bootstrap/);
	});

	test('blocks a stale SHA from publishing a missing version behind npm latest', async () => {
		const state = await inspectNpmReleaseState([{ name: 'octane', version: '0.1.15' }], {
			fetchImpl: registryFixture({
				octane: metadata('0.1.16', ['0.1.13', '0.1.16']),
			}),
		});

		assert.deepEqual(state.pending, []);
		assert.match(releaseStateErrors(state)[0], /npm latest is 0\.1\.16/);
	});

	test('fails closed when registry state cannot be read', async () => {
		const state = await inspectNpmReleaseState([{ name: 'octane', version: '0.1.16' }], {
			fetchImpl: registryFixture({ octane: new Error('registry unavailable') }),
		});

		assert.match(releaseStateErrors(state)[0], /registry unavailable/);
	});
});

describe('compareSemver', () => {
	test('orders stable and prerelease versions', () => {
		assert.equal(compareSemver('0.1.16', '0.1.15'), 1);
		assert.equal(compareSemver('0.1.16', '0.1.16'), 0);
		assert.equal(compareSemver('0.1.16-beta.2', '0.1.16-beta.11'), -1);
		assert.equal(compareSemver('0.1.16', '0.1.16-beta.11'), 1);
	});
});

describe('npm publish preparation', () => {
	test('keeps pending release plans from switching the recovery action into version mode', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'octane-publish-'));
		const directory = path.join(root, '.changeset');
		await mkdir(directory);
		await Promise.all([
			writeFile(path.join(directory, 'config.json'), '{}'),
			writeFile(path.join(directory, 'README.md'), 'Changesets documentation'),
			writeFile(path.join(directory, 'pending-release.md'), 'pending release'),
			writeFile(path.join(directory, 'empty-release.md'), 'empty release'),
		]);

		try {
			assert.deepEqual(await isolatePendingChangesets(directory), [
				'empty-release.md',
				'pending-release.md',
			]);
			assert.deepEqual((await readdir(directory)).sort(), [
				'.empty-release.md.publish-pending',
				'.pending-release.md.publish-pending',
				'README.md',
				'config.json',
			]);
			assert.equal(
				await readFile(path.join(directory, '.pending-release.md.publish-pending'), 'utf8'),
				'pending release',
			);
			assert.deepEqual(await isolatePendingChangesets(directory), []);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
