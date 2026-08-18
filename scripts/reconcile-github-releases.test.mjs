import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
	changelogEntry,
	listRemoteTags,
	reconcileGithubReleases,
	releaseTag,
	runGit,
} from './reconcile-github-releases.mjs';

async function git(cwd, args) {
	return runGit(args, { cwd });
}

async function writePackage(root, name, version, previousVersion) {
	const directory = path.join(root, 'packages', name.replaceAll('/', '-'));
	await mkdir(directory, { recursive: true });
	await writeFile(
		path.join(directory, 'CHANGELOG.md'),
		`# ${name}\n\n## ${version}\n\n### Patch Changes\n\n- current ${name}\n\n## ${previousVersion}\n\n- previous\n`,
	);
	return { directory, name, version };
}

async function createRepositoryFixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), 'octane-release-reconcile-'));
	const repository = path.join(root, 'checkout');
	const remote = path.join(root, 'remote.git');
	await mkdir(repository);
	await git(root, ['init', '--bare', remote]);
	await git(repository, ['init', '-b', 'main']);
	await git(repository, ['config', 'user.name', 'Release Test']);
	await git(repository, ['config', 'user.email', 'release-test@example.com']);
	await writeFile(path.join(repository, 'README.md'), 'release fixture\n');
	await git(repository, ['add', 'README.md']);
	await git(repository, ['commit', '-m', 'release fixture']);
	await git(repository, ['remote', 'add', 'origin', remote]);
	const expectedSha = (await git(repository, ['rev-parse', 'HEAD'])).stdout.trim();
	return { expectedSha, remote, repository, root };
}

describe('GitHub release reconciliation', () => {
	test('pushes annotated missing tags atomically without repository identity and creates every missing release sequentially', async () => {
		const { expectedSha, remote, repository, root } = await createRepositoryFixture();
		try {
			const packages = await Promise.all([
				writePackage(repository, '@octanejs/alpha', '0.1.2', '0.1.1'),
				writePackage(repository, '@octanejs/beta', '0.2.3', '0.2.2'),
				writePackage(repository, 'octane', '0.3.4', '0.3.3'),
			]);
			await git(repository, ['tag', releaseTag(packages[0]), '-m', releaseTag(packages[0])]);
			await git(repository, [
				'push',
				'origin',
				`refs/tags/${releaseTag(packages[0])}:refs/tags/${releaseTag(packages[0])}`,
			]);
			await git(repository, ['config', 'user.name', '']);
			await git(repository, ['config', 'user.email', '']);

			let pushCount = 0;
			const instrumentedGit = async (args, options = {}) => {
				if (args[0] === 'push') pushCount++;
				return runGit(args, options);
			};
			const releases = new Set();
			const created = [];
			let activeCreates = 0;
			let maximumActiveCreates = 0;
			const result = await reconcileGithubReleases(packages, {
				createRelease: async (pkg, body) => {
					activeCreates++;
					maximumActiveCreates = Math.max(maximumActiveCreates, activeCreates);
					await Promise.resolve();
					created.push({ body, tag: releaseTag(pkg) });
					releases.add(releaseTag(pkg));
					activeCreates--;
				},
				cwd: repository,
				expectedSha,
				git: instrumentedGit,
				getReleaseTags: async () => new Set(releases),
			});

			assert.equal(pushCount, 1);
			assert.equal(maximumActiveCreates, 1);
			assert.deepEqual(
				result.missingTagPackages.map(releaseTag),
				packages.slice(1).map(releaseTag),
			);
			assert.deepEqual(
				created,
				packages.map((pkg) => ({
					body: `### Patch Changes\n\n- current ${pkg.name}`,
					tag: releaseTag(pkg),
				})),
			);

			const remoteTags = await listRemoteTags({ cwd: repository });
			assert.deepEqual([...remoteTags].sort(), packages.map(releaseTag).sort());
			for (const pkg of packages) {
				const objectType = await git(remote, ['cat-file', '-t', `refs/tags/${releaseTag(pkg)}`]);
				assert.equal(objectType.stdout.trim(), 'tag');
				const target = await git(remote, ['rev-list', '-n', '1', `refs/tags/${releaseTag(pkg)}`]);
				assert.equal(target.stdout.trim(), expectedSha);
			}

			pushCount = 0;
			created.length = 0;
			const repeated = await reconcileGithubReleases(packages, {
				createRelease: async (pkg) => created.push(releaseTag(pkg)),
				cwd: repository,
				expectedSha,
				git: instrumentedGit,
				getReleaseTags: async () => new Set(releases),
			});
			assert.equal(pushCount, 0);
			assert.deepEqual(created, []);
			assert.deepEqual(repeated.missingTagPackages, []);
			assert.deepEqual(repeated.createdReleases, []);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('repairs tags before querying GitHub releases', async () => {
		const { expectedSha, repository, root } = await createRepositoryFixture();
		try {
			const pkg = await writePackage(repository, '@octanejs/alpha', '0.1.2', '0.1.1');
			await assert.rejects(
				reconcileGithubReleases([pkg], {
					cwd: repository,
					expectedSha,
					getReleaseTags: async () => {
						throw new Error('GraphQL unavailable');
					},
				}),
				/GraphQL unavailable/,
			);

			const remoteTags = await listRemoteTags({ cwd: repository });
			assert.equal(remoteTags.has(releaseTag(pkg)), true);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('skips an incomplete changelog and continues creating later releases', async () => {
		const { expectedSha, repository, root } = await createRepositoryFixture();
		try {
			const incomplete = await writePackage(repository, '@octanejs/incomplete', '0.1.2', '0.1.1');
			await writeFile(
				path.join(incomplete.directory, 'CHANGELOG.md'),
				'# @octanejs/incomplete\n\n## 0.1.1\n\n- previous\n',
			);
			const later = await writePackage(repository, '@octanejs/later', '0.2.3', '0.2.2');
			const created = [];
			const result = await reconcileGithubReleases([incomplete, later], {
				createRelease: async (pkg) => created.push(releaseTag(pkg)),
				cwd: repository,
				expectedSha,
				getReleaseTags: async () => new Set(),
			});

			assert.deepEqual(created, [releaseTag(later)]);
			assert.deepEqual(result.skippedReleases.map(releaseTag), [releaseTag(incomplete)]);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('extracts only the requested changelog version', () => {
		const changelog = '# pkg\n\n## 1.2.0\n\n- newest\n\n## 1.1.0\n\n- old\n';
		assert.equal(changelogEntry(changelog, '1.2.0'), '- newest');
		assert.equal(changelogEntry(changelog, '9.9.9'), undefined);
	});
});
