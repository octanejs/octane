import { notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import removeMarkdown from 'remove-markdown';
import * as v from 'valibot';
import { extractFrameworksFromMarkdown } from './markdown/filterFrameworkContent';
import { buildRedirectManifest, type RedirectManifestEntry } from './redirects';
import { isValidRepoPath, MAX_REPO_PATH_LENGTH } from './repo-path';
import { removeLeadingSlash } from './utils';
import type { DocsRedirectManifest } from './docs-redirects';
import type { GitHubFileNode } from './documents.server';

export type DocsTreeNode = {
	path: string;
	children?: Array<DocsTreeNode>;
};

type DocsManifest = DocsRedirectManifest;

type RepoFileRequest = {
	repo: string;
	branch: string;
	filePath: string;
};

type RepoDirectoryRequest = {
	repo: string;
	branch: string;
	startingPath: string;
};

// Inputs feed into a database cache key + a GitHub API URL. They must be
// shaped like real repo/ref/path values — anything else is a broken backlink,
// a scraper, or a probe and shouldn't get the privilege of becoming a row.
// See assertValidCacheKey in github-content-cache.server.ts for the matching
// defense at the cache boundary.
const repoSchema = v.pipe(
	v.string(),
	v.maxLength(100),
	v.regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/),
);

const branchSchema = v.pipe(
	v.string(),
	v.maxLength(100),
	v.regex(/^[a-zA-Z0-9._/-]+$/),
	v.check(
		(s) => !s.includes('..') && !s.startsWith('/') && !s.endsWith('/') && !s.includes('//'),
		'invalid branch',
	),
);

const repoPathSchema = v.pipe(
	v.string(),
	v.maxLength(MAX_REPO_PATH_LENGTH),
	v.check(isValidRepoPath, 'invalid path'),
);

const repoFileInput = v.object({
	repo: repoSchema,
	branch: branchSchema,
	filePath: repoPathSchema,
});

const repoDirectoryInput = v.object({
	repo: repoSchema,
	branch: branchSchema,
	startingPath: repoPathSchema,
});

const docsManifestInput = v.object({
	repo: repoSchema,
	branch: branchSchema,
	docsRoot: repoPathSchema,
});

const docsRedirectInput = v.object({
	repo: repoSchema,
	branch: branchSchema,
	docsRoot: repoPathSchema,
	docsPaths: v.array(v.pipe(v.string(), v.maxLength(512))),
});

// Matches RAW_FETCH_CONCURRENCY in github-example.server.ts.
const DOCS_MANIFEST_FETCH_CONCURRENCY = 6;

export async function mapWithConcurrency<T, TResult>(
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

const temporarilyUnavailableMarkdown = `# Content temporarily unavailable

We are having trouble fetching this document from GitHub right now. Please try again in a minute.`;

async function loadDocumentsServerModule() {
	return import('./documents.server');
}

async function loadGitHubContentCacheServerModule() {
	return import('./github-content-cache.server');
}

function buildUnavailableFile(filePath: string) {
	if (filePath.toLowerCase().endsWith('.md')) {
		return temporarilyUnavailableMarkdown;
	}

	return 'Content temporarily unavailable. Please try again in a minute.';
}

async function readRepoFileOrFallback(repo: string, branch: string, filePath: string) {
	const { fetchRepoFile, isRecoverableGitHubContentError } = await loadDocumentsServerModule();

	try {
		return await fetchRepoFile(repo, branch, filePath);
	} catch (error) {
		if (!isRecoverableGitHubContentError(error)) {
			throw error;
		}

		return buildUnavailableFile(filePath);
	}
}

function setDocsCacheHeaders(cdnCacheControl: string) {
	setResponseHeader('Cache-Control', 'public, max-age=0, must-revalidate');
	setResponseHeader('Cloudflare-CDN-Cache-Control', cdnCacheControl);
}

function isDocsManifest(value: unknown): value is DocsManifest {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as {
		paths?: unknown;
		redirects?: unknown;
	};

	return (
		Array.isArray(candidate.paths) &&
		candidate.paths.every((path) => typeof path === 'string') &&
		typeof candidate.redirects === 'object' &&
		candidate.redirects !== null &&
		Object.entries(candidate.redirects).every(
			([key, target]) => typeof key === 'string' && typeof target === 'string',
		)
	);
}

// Extracted so tests can inject a fake fetchFile without hitting real
// GitHub network/cache.
export async function collectRedirectEntriesForFile(
	node: DocsTreeNode,
	opts: {
		docsRoot: string;
		fetchFile: (filePath: string) => Promise<string | null>;
		onCanonicalPath: (canonicalPath: string) => void;
	},
): Promise<Array<RedirectManifestEntry>> {
	const { extractFrontMatter, isRecoverableGitHubContentError } = await loadDocumentsServerModule();
	const canonicalPath = getCanonicalDocsPath(node.path, opts.docsRoot);

	if (canonicalPath === null) {
		return [];
	}

	opts.onCanonicalPath(canonicalPath);

	let file: string | null;
	try {
		file = await opts.fetchFile(node.path);
	} catch (error) {
		if (!isRecoverableGitHubContentError(error)) {
			throw error;
		}

		return [];
	}

	if (!file) {
		return [];
	}

	const frontMatter = extractFrontMatter(file);
	const entries: Array<RedirectManifestEntry> = [];

	for (const redirectFrom of frontMatter.data.redirectFrom ?? []) {
		const normalizedRedirect = normalizeDocsRedirectPath(redirectFrom, opts.docsRoot);

		if (!normalizedRedirect || normalizedRedirect === canonicalPath) {
			continue;
		}

		entries.push({
			from: normalizedRedirect,
			to: canonicalPath,
			source: node.path,
		});
	}

	return entries;
}

async function buildDocsManifest({
	repo,
	branch,
	docsRoot,
}: {
	repo: string;
	branch: string;
	docsRoot: string;
}): Promise<DocsManifest> {
	const { fetchApiContents, fetchRepoFile } = await loadDocumentsServerModule();
	const nodes = await fetchApiContents(repo, branch, docsRoot);

	if (!nodes) {
		return { paths: [], redirects: {} };
	}

	const markdownFiles = flattenDocsNodes(nodes).filter((node) => node.path.endsWith('.md'));
	const paths = new Set<string>();

	// A recoverable error on one file must not fail the whole manifest build
	// (see collectRedirectEntriesForFile).
	const redirectsByFile = await mapWithConcurrency(
		markdownFiles,
		DOCS_MANIFEST_FETCH_CONCURRENCY,
		(node) =>
			collectRedirectEntriesForFile(node, {
				docsRoot,
				fetchFile: (filePath) => fetchRepoFile(repo, branch, filePath),
				onCanonicalPath: (canonicalPath) => paths.add(canonicalPath),
			}),
	);

	return {
		paths: Array.from(paths),
		redirects: buildRedirectManifest(redirectsByFile.flat(), {
			label: `docs redirects for ${repo}@${branch}:${docsRoot}`,
		}),
	};
}

async function buildDocsPathManifest({
	repo,
	branch,
	docsRoot,
}: {
	repo: string;
	branch: string;
	docsRoot: string;
}): Promise<DocsManifest> {
	const { fetchApiContents } = await loadDocumentsServerModule();
	const nodes = await fetchApiContents(repo, branch, docsRoot);

	if (!nodes) {
		return { paths: [], redirects: {} };
	}

	const paths = flattenDocsNodes(nodes)
		.filter((node) => node.path.endsWith('.md'))
		.flatMap((node) => {
			const canonicalPath = getCanonicalDocsPath(node.path, docsRoot);
			return canonicalPath === null ? [] : [canonicalPath];
		});

	return {
		paths,
		redirects: {},
	};
}

export const fetchDocsManifest = createServerFn({ method: 'GET' })
	.validator(docsManifestInput)
	.handler(async ({ data }) => {
		const { repo, branch, docsRoot } = data;
		const [{ shouldUseLocalDocsFiles }, { getCachedDocsArtifact }] = await Promise.all([
			loadDocumentsServerModule(),
			loadGitHubContentCacheServerModule(),
		]);

		if (shouldUseLocalDocsFiles()) {
			return buildDocsManifest({ repo, branch, docsRoot });
		}

		return getCachedDocsArtifact({
			repo,
			gitRef: branch,
			docsRoot,
			artifactType: 'docs-manifest',
			artifactKey: 'default',
			isValue: isDocsManifest,
			build: () => buildDocsManifest({ repo, branch, docsRoot }),
		});
	});

export const fetchDocsPathManifest = createServerFn({ method: 'GET' })
	.validator(docsManifestInput)
	.handler(async ({ data }) => {
		const { repo, branch, docsRoot } = data;
		const [{ shouldUseLocalDocsFiles }, { getCachedDocsArtifact }] = await Promise.all([
			loadDocumentsServerModule(),
			loadGitHubContentCacheServerModule(),
		]);

		if (shouldUseLocalDocsFiles()) {
			return buildDocsPathManifest({ repo, branch, docsRoot });
		}

		return getCachedDocsArtifact({
			repo,
			gitRef: branch,
			docsRoot,
			artifactType: 'docs-path-manifest',
			artifactKey: 'default',
			isValue: isDocsManifest,
			build: () => buildDocsPathManifest({ repo, branch, docsRoot }),
		});
	});

export const fetchDocsRedirect = createServerFn({ method: 'GET' })
	.validator(docsRedirectInput)
	.handler(async ({ data }) => {
		const { isRecoverableGitHubContentError } = await loadDocumentsServerModule();
		let manifest: DocsManifest;

		try {
			manifest = await fetchDocsManifest({
				data: {
					repo: data.repo,
					branch: data.branch,
					docsRoot: data.docsRoot,
				},
			});
		} catch (error) {
			if (isRecoverableGitHubContentError(error)) {
				return null;
			}

			throw error;
		}

		for (const docsPath of data.docsPaths) {
			const normalizedDocsPath = normalizeDocsRedirectPath(docsPath, data.docsRoot);

			if (!normalizedDocsPath) {
				continue;
			}

			const redirectedPath = manifest.redirects[normalizedDocsPath];

			if (redirectedPath !== undefined) {
				return redirectedPath;
			}
		}

		return null;
	});

export const fetchDocs = createServerFn({ method: 'GET' })
	.validator(repoFileInput)
	.handler(async ({ data }: { data: RepoFileRequest }) => {
		const { repo, branch, filePath } = data;
		const file = await readRepoFileOrFallback(repo, branch, filePath);

		if (!file) {
			throw notFound();
		}

		const { extractFrontMatter } = await loadDocumentsServerModule();
		const frontMatter = extractFrontMatter(file);
		const description = frontMatter.userDescription ?? removeMarkdown(frontMatter.excerpt ?? '');
		const keywords = extractFrontMatterKeywords(frontMatter.data.keywords);

		setDocsCacheHeaders('public, max-age=60, stale-while-revalidate=60');

		return {
			content: frontMatter.content,
			title: frontMatter.data?.title ?? 'Content temporarily unavailable',
			description,
			keywords,
			frameworks: extractFrameworksFromMarkdown(frontMatter.content),
			filePath,
			frontmatter: frontMatter.data,
		};
	});

function extractFrontMatterKeywords(value: unknown): string | undefined {
	if (Array.isArray(value)) {
		const normalized = value
			.filter((item): item is string => typeof item === 'string')
			.map((item) => item.trim())
			.filter((item) => item.length > 0);

		return normalized.length > 0 ? normalized.join(', ') : undefined;
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	return undefined;
}

export const fetchFile = createServerFn({ method: 'GET' })
	.validator(repoFileInput)
	.handler(async ({ data }: { data: RepoFileRequest }) => {
		const { repo, branch, filePath } = data;
		const file = await readRepoFileOrFallback(repo, branch, filePath);

		if (!file) {
			throw notFound();
		}

		setDocsCacheHeaders('public, max-age=300, stale-while-revalidate=300');

		return file;
	});

export const fetchRepoDirectoryContents = createServerFn({
	method: 'GET',
})
	.validator(repoDirectoryInput)
	.handler(async ({ data }: { data: RepoDirectoryRequest }) => {
		const { repo, branch, startingPath } = data;
		const { fetchApiContents, isRecoverableGitHubContentError } = await loadDocumentsServerModule();
		let githubContents: Array<GitHubFileNode> | null;

		try {
			githubContents = await fetchApiContents(repo, branch, startingPath);
		} catch (error) {
			if (!isRecoverableGitHubContentError(error)) {
				throw error;
			}

			return null;
		}

		setDocsCacheHeaders('public, max-age=300, stale-while-revalidate=300');

		return githubContents;
	});

function flattenDocsNodes(nodes: Array<DocsTreeNode>): Array<DocsTreeNode> {
	return nodes.flatMap((node) => [node, ...flattenDocsNodes(node.children ?? [])]);
}

function getCanonicalDocsPath(filePath: string, docsRoot: string) {
	const normalizedFilePath = removeLeadingSlash(filePath);
	const normalizedDocsRoot = removeLeadingSlash(docsRoot);
	const docsRootPrefix = `${normalizedDocsRoot}/`;

	if (!normalizedFilePath.startsWith(docsRootPrefix)) {
		return null;
	}

	return normalizedFilePath
		.slice(docsRootPrefix.length)
		.replace(/\.md$/, '')
		.replace(/\/index$/, '');
}

function normalizeDocsRedirectPath(path: string, docsRoot?: string) {
	const normalizedPath = removeLeadingSlash(path.trim()).replace(/\/+$/g, '');

	if (!normalizedPath || !isValidRepoPath(normalizedPath)) {
		return null;
	}

	const docsRootPrefix = getDocsRootPrefix(docsRoot);

	if (docsRootPrefix && normalizedPath.startsWith(`${docsRootPrefix}/`)) {
		return normalizedPath.slice(docsRootPrefix.length + 1) || '';
	}

	return normalizedPath;
}

function getDocsRootPrefix(docsRoot?: string) {
	if (!docsRoot) {
		return null;
	}

	const normalizedDocsRoot = removeLeadingSlash(docsRoot).replace(/\/+$/g, '');

	if (!normalizedDocsRoot.startsWith('docs/')) {
		return null;
	}

	return normalizedDocsRoot.slice('docs/'.length) || null;
}
