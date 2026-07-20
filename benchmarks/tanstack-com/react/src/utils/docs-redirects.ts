import { isValidRepoPath } from './repo-path';
import { removeLeadingSlash } from './utils';

export type DocsRedirectManifest = {
	paths: Array<string>;
	redirects: Record<string, string>;
};

export type DocsPathResolution =
	| {
			type: 'render';
			docsPath: string;
	  }
	| {
			type: 'redirect';
			docsPath: string;
	  }
	| {
			type: 'not-found';
	  };

type ResolveDocsPathRedirectOptions = {
	defaultDocs: string;
	docsPath: string;
	frameworks: Array<string>;
	manifest: DocsRedirectManifest;
};

export function resolveDocsPathRedirect({
	defaultDocs,
	docsPath,
	frameworks,
	manifest,
}: ResolveDocsPathRedirectOptions): DocsPathResolution {
	const requestedPath = normalizeDocsPath(docsPath);

	if (requestedPath === null) {
		return { type: 'not-found' };
	}

	const knownPaths = new Set(manifest.paths.map(normalizeManifestPath));

	if (knownPaths.has(requestedPath)) {
		return { type: 'render', docsPath: requestedPath };
	}

	const redirectFromTarget = getRedirectTarget({
		knownPaths,
		manifest,
		requestedPath,
	});

	if (redirectFromTarget !== null) {
		return { type: 'redirect', docsPath: redirectFromTarget };
	}

	const frameworkRedirectTarget = getFrameworkRedirectTarget({
		defaultDocs,
		frameworks,
		knownPaths,
		requestedPath,
	});

	if (frameworkRedirectTarget !== null) {
		return { type: 'redirect', docsPath: frameworkRedirectTarget };
	}

	const sectionIndexRedirectTarget = getSectionIndexRedirectTarget({
		knownPaths,
		requestedPath,
	});

	if (sectionIndexRedirectTarget !== null) {
		return { type: 'redirect', docsPath: sectionIndexRedirectTarget };
	}

	return { type: 'not-found' };
}

export function appendPathToDocsHref(opts: {
	docsPath: string;
	libraryId: string;
	version: string;
}) {
	const pathSuffix = opts.docsPath ? `/${opts.docsPath}` : '';
	return `/${opts.libraryId}/${opts.version}/docs${pathSuffix}`;
}

export function buildDocsRedirectHref(opts: {
	baseHref: string;
	docsPath: string;
	libraryId: string;
	version: string;
}) {
	const targetPathname = appendPathToDocsHref(opts);
	const url = new URL(opts.baseHref, 'https://tanstack.com');
	url.pathname = targetPathname;
	return `${url.pathname}${url.search}${url.hash}`;
}

export function buildDocsMarkdownRedirectHref(opts: {
	docsPath: string;
	libraryId: string;
	requestUrl: string;
	version: string;
}) {
	const targetPathname = `${appendPathToDocsHref(opts)}.md`;
	const url = new URL(opts.requestUrl);
	url.pathname = targetPathname;
	return url.href;
}

function getRedirectTarget(opts: {
	knownPaths: Set<string>;
	manifest: DocsRedirectManifest;
	requestedPath: string;
}) {
	const targetPath = normalizeDocsPath(opts.manifest.redirects[opts.requestedPath]);

	if (
		targetPath === null ||
		targetPath === opts.requestedPath ||
		!opts.knownPaths.has(targetPath)
	) {
		return null;
	}

	return targetPath;
}

function getFrameworkRedirectTarget(opts: {
	defaultDocs: string;
	frameworks: Array<string>;
	knownPaths: Set<string>;
	requestedPath: string;
}) {
	const parts = opts.requestedPath.split('/');
	const [firstSegment, secondSegment, ...remainingSegments] = parts;
	const supportedFrameworks = new Set(opts.frameworks);

	if (firstSegment === 'framework' && secondSegment) {
		if (!supportedFrameworks.has(secondSegment)) {
			return null;
		}

		const restPath = remainingSegments.join('/');
		return getExistingCandidate(opts.knownPaths, [
			restPath,
			restPath === 'overview' ? opts.defaultDocs : null,
		]);
	}

	if (!firstSegment || !supportedFrameworks.has(firstSegment)) {
		return null;
	}

	const restPath = [secondSegment, ...remainingSegments].filter(Boolean).join('/');
	const frameworkPath = restPath ? `framework/${firstSegment}/${restPath}` : null;

	return getExistingCandidate(opts.knownPaths, [
		frameworkPath,
		restPath,
		restPath === 'overview' ? opts.defaultDocs : null,
	]);
}

function getExistingCandidate(knownPaths: Set<string>, candidates: Array<string | null>) {
	for (const candidate of candidates) {
		const normalizedCandidate = normalizeDocsPath(candidate);

		if (normalizedCandidate && knownPaths.has(normalizedCandidate)) {
			return normalizedCandidate;
		}
	}

	return null;
}

function getSectionIndexRedirectTarget(opts: { knownPaths: Set<string>; requestedPath: string }) {
	const [firstSegment] = opts.requestedPath.split('/');
	const indexableSections = new Set(['api', 'reference']);

	if (
		!firstSegment ||
		!indexableSections.has(firstSegment) ||
		firstSegment === opts.requestedPath ||
		!opts.knownPaths.has(firstSegment)
	) {
		return null;
	}

	return firstSegment;
}

function normalizeManifestPath(path: string) {
	return removeLeadingSlash(path.trim())
		.replace(/\.md$/, '')
		.replace(/\/index$/, '')
		.replace(/\/+$/g, '');
}

function normalizeDocsPath(path: string | null | undefined) {
	if (typeof path !== 'string') {
		return null;
	}

	const normalizedPath = normalizeManifestPath(path);

	if (!normalizedPath || !isValidRepoPath(normalizedPath)) {
		return null;
	}

	return normalizedPath;
}
