import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
	inspectNpmReleaseState,
	releaseStateErrors,
	renderReleaseSummary,
} from './npm-release-preflight.mjs';
import { getPublishablePackages, REPO_ROOT } from './workspace-packages.mjs';

const DEFAULT_GITHUB_API_URL = 'https://api.github.com';

function identity(pkg) {
	return `${pkg.name}@${pkg.version}`;
}

export function releaseTag(pkg) {
	return identity(pkg);
}

export function changelogEntry(changelog, version) {
	const lines = changelog.split(/\r?\n/);
	const heading = `## ${version}`;
	const start = lines.findIndex((line) => line.trim() === heading);
	if (start === -1) return undefined;
	let end = lines.length;
	for (let index = start + 1; index < lines.length; index++) {
		if (/^##\s+/.test(lines[index])) {
			end = index;
			break;
		}
	}
	return lines
		.slice(start + 1, end)
		.join('\n')
		.trim();
}

function run(command, args, { cwd = REPO_ROOT } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.on('error', reject);
		child.on('close', (status, signal) => {
			resolve({ signal, status, stderr, stdout });
		});
	});
}

export async function runGit(args, { cwd = REPO_ROOT, allowFailure = false } = {}) {
	const result = await run('git', args, { cwd });
	if (result.signal !== null || (!allowFailure && result.status !== 0)) {
		throw new Error(
			`git ${args.join(' ')} failed${
				result.signal === null
					? ` with exit code ${result.status}`
					: ` from signal ${result.signal}`
			}:\n${result.stderr || result.stdout}`,
		);
	}
	return result;
}

export async function listRemoteTags({ cwd = REPO_ROOT, git = runGit } = {}) {
	const result = await git(['ls-remote', '--tags', '--refs', 'origin'], { cwd });
	return new Set(
		result.stdout
			.split(/\r?\n/)
			.filter(Boolean)
			.map((line) => line.split('\trefs/tags/')[1])
			.filter(Boolean),
	);
}

function parseRepository(repository) {
	const [owner, repo, ...rest] = repository.split('/');
	if (!owner || !repo || rest.length > 0) {
		throw new Error(`GITHUB_REPOSITORY must be owner/name, received ${JSON.stringify(repository)}`);
	}
	return { owner, repo };
}

function graphqlUrl(apiUrl) {
	if (apiUrl.endsWith('/api/v3')) return `${apiUrl.slice(0, -'/api/v3'.length)}/api/graphql`;
	return `${apiUrl.replace(/\/$/, '')}/graphql`;
}

async function githubJson(
	url,
	{ body, fetchImpl = fetch, method = 'POST', token = process.env.GITHUB_TOKEN } = {},
) {
	if (!token) throw new Error('GITHUB_TOKEN is required to reconcile GitHub releases');
	const response = await fetchImpl(url, {
		method,
		headers: {
			accept: 'application/vnd.github+json',
			authorization: `Bearer ${token}`,
			'content-type': 'application/json',
			'user-agent': 'octane-release-reconciliation',
			'x-github-api-version': '2022-11-28',
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	let payload;
	try {
		payload = await response.json();
	} catch {
		payload = undefined;
	}
	if (!response.ok) {
		throw new Error(
			`GitHub API ${method} ${url} returned HTTP ${response.status}: ${
				payload?.message ?? 'invalid JSON response'
			}`,
		);
	}
	return payload;
}

export async function listGithubReleaseTags(
	packages,
	{
		apiUrl = process.env.GITHUB_API_URL ?? DEFAULT_GITHUB_API_URL,
		fetchImpl = fetch,
		repository = process.env.GITHUB_REPOSITORY,
		token = process.env.GITHUB_TOKEN,
	} = {},
) {
	if (packages.length === 0) return new Set();
	const { owner, repo } = parseRepository(repository ?? '');
	const fields = packages
		.map(
			(pkg, index) => `r${index}: release(tagName: ${JSON.stringify(releaseTag(pkg))}) { tagName }`,
		)
		.join('\n');
	const payload = await githubJson(graphqlUrl(apiUrl), {
		body: {
			query: `query($owner: String!, $repo: String!) {\nrepository(owner: $owner, name: $repo) {\n${fields}\n}\n}`,
			variables: { owner, repo },
		},
		fetchImpl,
		token,
	});
	if (payload.errors?.length) {
		throw new Error(
			`GitHub GraphQL query failed: ${payload.errors.map((error) => error.message).join('; ')}`,
		);
	}
	const releases = payload.data?.repository;
	if (!releases) throw new Error(`GitHub repository ${repository} was not returned by GraphQL`);
	return new Set(
		packages.flatMap((pkg, index) => (releases[`r${index}`] ? [releaseTag(pkg)] : [])),
	);
}

export async function createGithubRelease(
	pkg,
	body,
	{
		apiUrl = process.env.GITHUB_API_URL ?? DEFAULT_GITHUB_API_URL,
		fetchImpl = fetch,
		repository = process.env.GITHUB_REPOSITORY,
		token = process.env.GITHUB_TOKEN,
	} = {},
) {
	const { owner, repo } = parseRepository(repository ?? '');
	const tag = releaseTag(pkg);
	await githubJson(
		`${apiUrl.replace(/\/$/, '')}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`,
		{
			body: {
				body,
				name: tag,
				prerelease: pkg.version.includes('-'),
				tag_name: tag,
			},
			fetchImpl,
			token,
		},
	);
}

async function ensureLocalTag(tag, expectedSha, { cwd, git }) {
	const existing = await git(['show-ref', '--verify', '--quiet', `refs/tags/${tag}`], {
		allowFailure: true,
		cwd,
	});
	if (existing.status === 0) {
		const target = await git(['rev-list', '-n', '1', `refs/tags/${tag}`], { cwd });
		if (target.stdout.trim() !== expectedSha) {
			throw new Error(
				`local tag ${tag} targets ${target.stdout.trim()}, expected validated SHA ${expectedSha}`,
			);
		}
		return;
	}
	if (existing.status !== 1) {
		throw new Error(`could not inspect local tag ${tag}: ${existing.stderr || existing.stdout}`);
	}
	await git(['tag', tag, '-m', tag, expectedSha], { cwd });
}

async function releaseBody(pkg) {
	let changelog;
	try {
		changelog = await readFile(path.join(pkg.directory, 'CHANGELOG.md'), 'utf8');
	} catch (error) {
		if (error?.code === 'ENOENT') return undefined;
		throw error;
	}
	return changelogEntry(changelog, pkg.version);
}

export async function reconcileGithubReleases(
	packages,
	{
		createRelease = createGithubRelease,
		cwd = REPO_ROOT,
		expectedSha,
		git = runGit,
		getReleaseTags = listGithubReleaseTags,
		getRemoteTags = listRemoteTags,
	} = {},
) {
	if (!/^[0-9a-f]{40}$/.test(expectedSha ?? '')) {
		throw new Error(
			`expectedSha must be a full commit SHA, received ${JSON.stringify(expectedSha)}`,
		);
	}
	const head = (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
	if (head !== expectedSha) {
		throw new Error(`checked out HEAD ${head} does not match validated SHA ${expectedSha}`);
	}

	const remoteTags = await getRemoteTags({ cwd, git });
	const missingTagPackages = packages.filter((pkg) => !remoteTags.has(releaseTag(pkg)));
	for (const pkg of missingTagPackages) {
		await ensureLocalTag(releaseTag(pkg), expectedSha, { cwd, git });
	}
	if (missingTagPackages.length > 0) {
		await git(
			[
				'push',
				'--atomic',
				'origin',
				...missingTagPackages.map((pkg) => {
					const tag = releaseTag(pkg);
					return `refs/tags/${tag}:refs/tags/${tag}`;
				}),
			],
			{ cwd },
		);
		const reconciledTags = await getRemoteTags({ cwd, git });
		const stillMissing = missingTagPackages.filter((pkg) => !reconciledTags.has(releaseTag(pkg)));
		if (stillMissing.length > 0) {
			throw new Error(
				`GitHub is still missing release tags after the atomic push:\n${stillMissing
					.map((pkg) => `  - ${releaseTag(pkg)}`)
					.join('\n')}`,
			);
		}
	}

	const githubReleaseTags = await getReleaseTags(packages);
	const missingReleasePackages = packages.filter((pkg) => !githubReleaseTags.has(releaseTag(pkg)));
	const createdReleases = [];
	const skippedReleases = [];
	for (const pkg of missingReleasePackages) {
		const body = await releaseBody(pkg);
		if (body === undefined) {
			skippedReleases.push(pkg);
			continue;
		}
		await createRelease(pkg, body);
		createdReleases.push(pkg);
	}

	return { createdReleases, missingTagPackages, skippedReleases };
}

function renderReconciliationSummary(result) {
	return `${[
		'## GitHub release reconciliation',
		'',
		`- Tags created: ${result.missingTagPackages.length}`,
		`- Releases created: ${result.createdReleases.length}`,
		`- Releases skipped (no matching changelog entry): ${result.skippedReleases.length}`,
	].join('\n')}\n`;
}

async function runCli() {
	const packages = getPublishablePackages();
	const state = await inspectNpmReleaseState(packages);
	const errors = releaseStateErrors(state);
	if (errors.length > 0) {
		for (const error of errors) console.error(`\n${error}`);
		process.exitCode = 1;
		return;
	}
	const packageByIdentity = new Map(packages.map((pkg) => [identity(pkg), pkg]));
	const publishedPackages = state.published.map((pkg) => packageByIdentity.get(identity(pkg)));
	if (publishedPackages.some((pkg) => pkg === undefined)) {
		throw new Error('npm release state returned an unknown workspace package');
	}
	const result = await reconcileGithubReleases(publishedPackages, {
		expectedSha: process.env.RELEASE_SHA,
	});
	const summary = `${renderReleaseSummary(state)}\n${renderReconciliationSummary(result)}`;
	process.stdout.write(summary);
	if (process.env.GITHUB_STEP_SUMMARY) {
		const { appendFile } = await import('node:fs/promises');
		await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
	}
	if (state.pending.length > 0) {
		throw new Error(
			`${state.pending.length} current package version(s) remain unpublished after the publish attempt`,
		);
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
