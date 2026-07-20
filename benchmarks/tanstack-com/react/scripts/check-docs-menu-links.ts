import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getBranch, publicLibraries } from '../src/libraries';
import { resolveDocsPathRedirect } from '../src/utils/docs-redirects';
import type { DocsRedirectManifest } from '../src/utils/docs-redirects';
import type { LibrarySlim } from '../src/libraries';

type ConfigItem = {
	label: string;
	to: string;
};

type ConfigFrameworkSection = {
	label: string;
	children: Array<ConfigItem>;
};

type ConfigSection = {
	label: string;
	children: Array<ConfigItem>;
	frameworks?: Array<ConfigFrameworkSection>;
};

type DocsConfig = {
	sections: Array<ConfigSection>;
};

type GitHubTreeItem = {
	path: string;
	type: string;
};

type MenuEntry = {
	framework?: string;
	item: ConfigItem;
	section: string;
};

type LinkTarget =
	| {
			kind: 'docs';
			path: string;
	  }
	| {
			kind: 'example';
			examplePath: string;
			framework: string;
	  }
	| {
			kind: 'internal';
			path: string;
	  }
	| {
			kind: 'external';
	  };

type Candidate = {
	branch: string;
	docsRoot: string;
	entry: MenuEntry;
	library: LibrarySlim;
	reason: string;
	target: Exclude<LinkTarget, { kind: 'external' }>;
	url: string;
};

type BrokenLink = {
	branch: string;
	docsRoot: string;
	finalUrl: string;
	framework?: string;
	label: string;
	library: string;
	reason: string;
	repo: string;
	section: string;
	status: number | 'error' | 'timeout';
	target: string;
	targetKind: string;
	to: string;
	url: string;
};

type SourceCandidate = Omit<BrokenLink, 'finalUrl' | 'status'>;

type FetchStatus = {
	finalUrl: string;
	status: BrokenLink['status'];
};

type CliOptions = {
	baseUrl: string;
	jsonPath?: string;
	verifySite: boolean;
};

const defaultBaseUrl = 'https://tanstack.com';
const requestTimeoutMs = 30_000;
const httpConcurrency = 3;
const statusFetchAttempts = 2;

const cliOptions = parseCliOptions(process.argv.slice(2));
const githubToken = getGitHubToken();

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});

async function main() {
	const candidates: Array<Candidate> = [];
	let checkedDocs = 0;
	let checkedExamples = 0;
	let checkedInternal = 0;

	for (const library of publicLibraries) {
		const branch = getBranch(library, 'latest');
		const docsRoot = library.docsRoot || 'docs';
		const [config, tree] = await Promise.all([
			fetchDocsConfig(library.repo, branch, docsRoot),
			fetchGitHubTree(library.repo, branch),
		]);

		if (!config) {
			console.warn(`${library.id}: skipped because ${docsRoot}/config.json was not found`);
			continue;
		}

		const manifest = buildDocsManifest(tree, docsRoot);
		const entries = getMenuEntries(config);
		let libraryCandidates = 0;

		for (const entry of entries) {
			const target = getLinkTarget(entry.item.to, library);

			if (target.kind === 'external') {
				continue;
			}

			if (target.kind === 'internal') {
				checkedInternal += 1;
				continue;
			}

			const url = buildDocsUrl(library.id, target);

			if (target.kind === 'example') {
				checkedExamples += 1;

				if (
					!library.frameworks.some((framework) => framework === target.framework) ||
					!hasExample(tree, target)
				) {
					libraryCandidates += 1;
					candidates.push({
						branch,
						docsRoot,
						entry,
						library,
						reason: 'example directory was not found',
						target,
						url,
					});
				}

				continue;
			}

			checkedDocs += 1;

			const resolution = resolveDocsPathRedirect({
				defaultDocs: library.defaultDocs ?? 'overview',
				docsPath: target.path,
				frameworks: library.frameworks,
				manifest,
			});

			if (resolution.type === 'not-found') {
				libraryCandidates += 1;
				candidates.push({
					branch,
					docsRoot,
					entry,
					library,
					reason: 'docs markdown path was not found',
					target,
					url,
				});
			}
		}

		console.log(
			[
				library.id,
				`${entries.length} menu items`,
				`${manifest.paths.length} docs paths`,
				`${libraryCandidates} candidates`,
			].join(': '),
		);
	}

	const brokenLinks = cliOptions.verifySite
		? await verifyCandidates(candidates, cliOptions.baseUrl)
		: candidates.map((candidate) => candidateToBrokenLink(candidate));

	const report = {
		generatedAt: new Date().toISOString(),
		baseUrl: cliOptions.baseUrl,
		checked: {
			docs: checkedDocs,
			examples: checkedExamples,
			internal: checkedInternal,
			candidates: candidates.length,
			broken: brokenLinks.length,
		},
		sourceCandidates: candidates.map(candidateToSourceCandidate),
		brokenLinks,
	};

	if (cliOptions.jsonPath) {
		mkdirSync(dirname(cliOptions.jsonPath), { recursive: true });
		writeFileSync(cliOptions.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
	}

	console.log('');
	console.log(
		`checked ${checkedDocs} docs links, ${checkedExamples} example links, and ${checkedInternal} internal links`,
	);

	if (brokenLinks.length === 0) {
		console.log('no broken docs menu links found');
		return;
	}

	console.log(`found ${brokenLinks.length} broken docs menu links`);
	for (const link of brokenLinks) {
		console.log(
			[
				`- ${link.status}`,
				link.library,
				link.section,
				link.framework ? `(${link.framework})` : '',
				`"${link.label}"`,
				link.url,
			]
				.filter(Boolean)
				.join(' '),
		);
	}

	process.exitCode = 1;
}

function parseCliOptions(args: Array<string>): CliOptions {
	const options: CliOptions = {
		baseUrl: process.env.TANSTACK_DOCS_LINK_BASE_URL ?? defaultBaseUrl,
		verifySite: true,
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--') {
			continue;
		}

		if (arg === '--json') {
			const value = args[index + 1];
			if (!value) {
				throw new Error('--json requires a file path');
			}
			options.jsonPath = value;
			index += 1;
			continue;
		}

		if (arg === '--base-url') {
			const value = args[index + 1];
			if (!value) {
				throw new Error('--base-url requires a URL');
			}
			options.baseUrl = value;
			index += 1;
			continue;
		}

		if (arg === '--no-site') {
			options.verifySite = false;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	options.baseUrl = options.baseUrl.replace(/\/+$/g, '');

	return options;
}

function getGitHubToken() {
	const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

	if (envToken) {
		return envToken;
	}

	try {
		return execFileSync('gh', ['auth', 'token'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
}

async function verifyCandidates(candidates: Array<Candidate>, baseUrl: string) {
	const results = await mapWithConcurrency(candidates, httpConcurrency, async (candidate) => {
		const status = await fetchStatus(new URL(candidate.url, baseUrl).href);

		if (typeof status.status === 'number' && status.status >= 200 && status.status < 400) {
			return undefined;
		}

		return candidateToBrokenLink(candidate, status);
	});

	return results.filter(isDefined);
}

async function fetchStatus(url: string): Promise<FetchStatus> {
	let lastStatus: FetchStatus = {
		finalUrl: url,
		status: 'error',
	};

	for (let attempt = 0; attempt < statusFetchAttempts; attempt += 1) {
		try {
			const response = await fetch(url, {
				headers: {
					'User-Agent': 'tanstack-docs-menu-link-check',
				},
				signal: AbortSignal.timeout(requestTimeoutMs),
			});
			await response.body?.cancel();

			return {
				finalUrl: response.url,
				status: response.status,
			};
		} catch (error) {
			lastStatus =
				error instanceof DOMException && error.name === 'TimeoutError'
					? {
							finalUrl: url,
							status: 'timeout',
						}
					: {
							finalUrl: url,
							status: 'error',
						};
		}
	}

	return lastStatus;
}

function candidateToBrokenLink(
	candidate: Candidate,
	status: FetchStatus = {
		finalUrl: candidate.url,
		status: 'error',
	},
): BrokenLink {
	return {
		finalUrl: status.finalUrl,
		status: status.status,
		...candidateToSourceCandidate(candidate),
	};
}

function candidateToSourceCandidate(candidate: Candidate): SourceCandidate {
	return {
		branch: candidate.branch,
		docsRoot: candidate.docsRoot,
		framework: candidate.entry.framework,
		label: candidate.entry.item.label,
		library: candidate.library.id,
		reason: candidate.reason,
		repo: candidate.library.repo,
		section: candidate.entry.section,
		target: getTargetPath(candidate.target),
		targetKind: candidate.target.kind,
		to: candidate.entry.item.to,
		url: candidate.url,
	};
}

function getTargetPath(target: Exclude<LinkTarget, { kind: 'external' }>) {
	if (target.kind === 'docs') {
		return target.path;
	}

	if (target.kind === 'example') {
		return `examples/${target.framework}/${target.examplePath}`;
	}

	return target.path;
}

async function fetchGitHubTree(repo: string, branch: string) {
	const value = await fetchGitHubJson(
		`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
	);

	if (!isRecord(value) || !Array.isArray(value.tree)) {
		throw new Error(`Invalid GitHub tree response for ${repo}@${branch}`);
	}

	return value.tree.filter(isGitHubTreeItem);
}

async function fetchDocsConfig(repo: string, branch: string, docsRoot: string) {
	const file = await fetchGitHubFile(repo, branch, `${docsRoot}/config.json`);

	if (!file) {
		return undefined;
	}

	const parsed: unknown = JSON.parse(file);

	if (!isDocsConfig(parsed)) {
		throw new Error(`Invalid docs config for ${repo}@${branch}:${docsRoot}`);
	}

	return parsed;
}

async function fetchGitHubFile(repo: string, branch: string, filePath: string) {
	const value = await fetchGitHubJson(
		`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath).replace(
			/%2F/g,
			'/',
		)}?ref=${encodeURIComponent(branch)}`,
		true,
	);

	if (!value) {
		return undefined;
	}

	if (!isRecord(value) || typeof value.content !== 'string') {
		throw new Error(`Invalid GitHub file response for ${repo}:${filePath}`);
	}

	const encoding = typeof value.encoding === 'string' ? value.encoding : 'base64';

	return Buffer.from(value.content, encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
}

async function fetchGitHubJson(url: string, allowNotFound = false) {
	const response = await fetch(url, {
		headers: {
			Accept: 'application/vnd.github+json',
			'User-Agent': 'tanstack-docs-menu-link-check',
			...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
		},
	});

	if (allowNotFound && response.status === 404) {
		await response.body?.cancel();
		return undefined;
	}

	if (!response.ok) {
		throw new Error(`GitHub request failed: ${response.status} ${response.statusText} ${url}`);
	}

	return response.json();
}

function buildDocsManifest(tree: Array<GitHubTreeItem>, docsRoot: string): DocsRedirectManifest {
	return {
		paths: tree.flatMap((item) => {
			if (
				item.type !== 'blob' ||
				!item.path.startsWith(`${docsRoot}/`) ||
				!item.path.endsWith('.md')
			) {
				return [];
			}

			const canonicalPath = getCanonicalDocsPath(item.path, docsRoot);
			return canonicalPath ? [canonicalPath] : [];
		}),
		redirects: {},
	};
}

function getCanonicalDocsPath(filePath: string, docsRoot: string) {
	const normalizedFilePath = removeLeadingSlash(filePath);
	const normalizedDocsRoot = removeLeadingSlash(docsRoot).replace(/\/+$/g, '');
	const prefix = `${normalizedDocsRoot}/`;

	if (!normalizedFilePath.startsWith(prefix)) {
		return undefined;
	}

	return normalizedFilePath
		.slice(prefix.length)
		.replace(/\.md$/, '')
		.replace(/\/index$/, '');
}

function getMenuEntries(config: DocsConfig): Array<MenuEntry> {
	return config.sections.flatMap((section) => [
		...section.children.map((item) => ({
			item,
			section: section.label,
		})),
		...(section.frameworks ?? []).flatMap((framework) =>
			framework.children.map((item) => ({
				framework: framework.label,
				item,
				section: section.label,
			})),
		),
	]);
}

function getLinkTarget(to: string, library: LibrarySlim): LinkTarget {
	const trimmed = to.trim();

	if (!trimmed || isExternalUrl(trimmed)) {
		return { kind: 'external' };
	}

	const path = removeSearchAndHash(trimmed);

	if (!path) {
		return { kind: 'external' };
	}

	if (path === '..') {
		return { kind: 'internal', path: `/${library.id}/latest` };
	}

	if (path === './framework') {
		return { kind: 'internal', path: `/${library.id}/latest/docs/framework` };
	}

	const docsPath = getDocsPath(path);

	if (!docsPath) {
		return { kind: 'internal', path: replaceRouteParams(path, library.id) };
	}

	if (isSpecialDocsPath(docsPath)) {
		return {
			kind: 'internal',
			path: `/${library.id}/latest/docs/${docsPath}`,
		};
	}

	const exampleTarget = getExampleTarget(docsPath);

	if (exampleTarget) {
		return exampleTarget;
	}

	return {
		kind: 'docs',
		path: docsPath,
	};
}

function getDocsPath(path: string) {
	if (path.startsWith('/')) {
		const normalized = replaceRouteParams(path, '__library__');
		const docsIndex = normalized.indexOf('/docs/');

		if (docsIndex === -1) {
			return undefined;
		}

		return normalized.slice(docsIndex + '/docs/'.length);
	}

	if (path.startsWith('../')) {
		return undefined;
	}

	return path.replace(/^\.\//, '');
}

function getExampleTarget(docsPath: string): LinkTarget | undefined {
	const match = /^framework\/([^/]+)\/examples\/(.+)$/.exec(docsPath);

	if (!match) {
		return undefined;
	}

	const framework = match[1];
	const examplePath = match[2];

	if (!framework || !examplePath) {
		return undefined;
	}

	return {
		examplePath,
		framework,
		kind: 'example',
	};
}

function buildDocsUrl(libraryId: string, target: LinkTarget) {
	switch (target.kind) {
		case 'docs':
			return `/${libraryId}/latest/docs/${target.path}`;
		case 'example':
			return `/${libraryId}/latest/docs/framework/${target.framework}/examples/${target.examplePath}`;
		case 'internal':
			return target.path;
		case 'external':
			return '';
	}
}

function hasExample(tree: Array<GitHubTreeItem>, target: Extract<LinkTarget, { kind: 'example' }>) {
	const prefix = `examples/${target.framework}/${target.examplePath}/`;

	return tree.some((item) => item.type === 'blob' && item.path.startsWith(prefix));
}

function isSpecialDocsPath(path: string) {
	return ['blog', 'contributors', 'npm-stats', 'community-resources'].includes(path);
}

function removeSearchAndHash(value: string) {
	return value.split('#')[0]?.split('?')[0] ?? '';
}

function replaceRouteParams(path: string, libraryId: string) {
	return path.replaceAll('$libraryId', libraryId).replaceAll('$version', 'latest');
}

function isExternalUrl(value: string) {
	return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function removeLeadingSlash(value: string) {
	return value.replace(/^\/+/, '');
}

async function mapWithConcurrency<T, TResult>(
	values: Array<T>,
	concurrency: number,
	fn: (value: T) => Promise<TResult>,
) {
	const results = new Array<TResult>(values.length);
	let index = 0;

	const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
		while (index < values.length) {
			const currentIndex = index;
			index += 1;
			results[currentIndex] = await fn(values[currentIndex]);
		}
	});

	await Promise.all(workers);

	return results;
}

function isDocsConfig(value: unknown): value is DocsConfig {
	if (!isRecord(value) || !Array.isArray(value.sections)) {
		return false;
	}

	return value.sections.every(isConfigSection);
}

function isConfigSection(value: unknown): value is ConfigSection {
	if (!isRecord(value)) {
		return false;
	}

	if (typeof value.label !== 'string' || !Array.isArray(value.children)) {
		return false;
	}

	const frameworks = value.frameworks;

	return (
		value.children.every(isConfigItem) &&
		(frameworks === undefined ||
			(Array.isArray(frameworks) && frameworks.every(isFrameworkSection)))
	);
}

function isFrameworkSection(value: unknown): value is ConfigFrameworkSection {
	return (
		isRecord(value) &&
		typeof value.label === 'string' &&
		Array.isArray(value.children) &&
		value.children.every(isConfigItem)
	);
}

function isConfigItem(value: unknown): value is ConfigItem {
	return isRecord(value) && typeof value.label === 'string' && typeof value.to === 'string';
}

function isGitHubTreeItem(value: unknown): value is GitHubTreeItem {
	return isRecord(value) && typeof value.path === 'string' && typeof value.type === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}
