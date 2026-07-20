import { isNotFound, notFound } from '@tanstack/react-router';
import {
	fetchDocs,
	fetchDocsManifest,
	fetchDocsPathManifest,
	fetchDocsRedirect,
	fetchFile,
	fetchRepoDirectoryContents,
} from './docs.functions';
import {
	buildDocsMarkdownRedirectHref,
	buildDocsRedirectHref,
	resolveDocsPathRedirect,
	type DocsPathResolution,
} from './docs-redirects';
import { removeLeadingSlash } from './utils';

export const loadDocs = async ({
	repo,
	branch,
	docsRoot,
	docsPath,
}: {
	repo: string;
	branch: string;
	docsRoot: string;
	docsPath: string;
}) => {
	if (!branch || !docsRoot || !docsPath) {
		throw notFound({
			data: {
				message: 'No doc was found here!',
			},
		});
	}

	const doc = await fetchDocs({
		data: {
			repo,
			branch,
			filePath: `${removeLeadingSlash(docsRoot)}/${docsPath}.md`,
		},
	});

	if (!doc) {
		throw notFound({
			data: {
				message: 'No doc was found here!',
			},
		});
	}

	return doc;
};

export async function getDocsManifest(opts: { repo: string; branch: string; docsRoot: string }) {
	return fetchDocsManifest({ data: opts });
}

export async function resolveDocsRoutePath(opts: {
	branch: string;
	defaultDocs: string;
	docsPath: string;
	docsRoot: string;
	frameworks: Array<string>;
	repo: string;
}): Promise<DocsPathResolution> {
	const defaultDocsResolution = getDefaultDocsResolution(opts);

	if (defaultDocsResolution) {
		return defaultDocsResolution;
	}

	const manifest = await fetchDocsPathManifest({
		data: {
			repo: opts.repo,
			branch: opts.branch,
			docsRoot: opts.docsRoot,
		},
	});

	if (manifest.paths.length === 0) {
		return { type: 'render', docsPath: opts.docsPath };
	}

	return resolveDocsPathRedirect({
		defaultDocs: opts.defaultDocs,
		docsPath: opts.docsPath,
		frameworks: opts.frameworks,
		manifest,
	});
}

function getDefaultDocsResolution(opts: {
	defaultDocs: string;
	docsPath: string;
	frameworks: Array<string>;
}): DocsPathResolution | null {
	const docsPath = normalizeRouteDocsPath(opts.docsPath);
	const defaultDocs = normalizeRouteDocsPath(opts.defaultDocs);

	if (!docsPath || !defaultDocs) {
		return null;
	}

	if (docsPath === defaultDocs) {
		return {
			type: 'render',
			docsPath,
		};
	}

	const [framework, ...restParts] = docsPath.split('/');
	const restPath = restParts.join('/');

	if (
		framework &&
		opts.frameworks.includes(framework) &&
		restPath === 'overview' &&
		defaultDocs === `framework/${framework}/overview`
	) {
		return {
			type: 'redirect',
			docsPath: defaultDocs,
		};
	}

	return null;
}

function normalizeRouteDocsPath(path: string) {
	return removeLeadingSlash(path.trim())
		.replace(/\.md$/, '')
		.replace(/\/index$/, '')
		.replace(/\/+$/g, '');
}

export type LoadDocsRouteResult =
	| {
			type: 'loaded';
			docsPath: string;
			doc: Awaited<ReturnType<typeof loadDocs>>;
	  }
	| {
			type: 'redirect';
			docsPath: string;
	  }
	| {
			type: 'not-found';
	  };

export async function loadDocsRoute(opts: {
	branch: string;
	defaultDocs: string;
	docsPath: string;
	docsRoot: string;
	frameworks: Array<string>;
	redirectFromPaths: Array<string>;
	repo: string;
}): Promise<LoadDocsRouteResult> {
	const resolution = await resolveDocsRoutePathWithRedirects(opts);

	if (resolution.type !== 'render') {
		return resolution;
	}

	try {
		return {
			type: 'loaded',
			docsPath: resolution.docsPath,
			doc: await loadDocs({
				repo: opts.repo,
				branch: opts.branch,
				docsRoot: opts.docsRoot,
				docsPath: resolution.docsPath,
			}),
		};
	} catch (error) {
		if (!isDocsNotFoundError(error)) {
			throw error;
		}

		const redirectPath = await resolveDocsRedirectFromPaths(opts);

		if (redirectPath !== null) {
			return {
				type: 'redirect',
				docsPath: redirectPath,
			};
		}

		return { type: 'not-found' };
	}
}

async function resolveDocsRoutePathWithRedirects(opts: {
	branch: string;
	defaultDocs: string;
	docsPath: string;
	docsRoot: string;
	frameworks: Array<string>;
	redirectFromPaths: Array<string>;
	repo: string;
}): Promise<DocsPathResolution> {
	const resolution = await resolveDocsRoutePath(opts);

	if (resolution.type !== 'not-found') {
		return resolution;
	}

	const redirectPath = await resolveDocsRedirectFromPaths(opts);

	if (redirectPath !== null) {
		return {
			type: 'redirect',
			docsPath: redirectPath,
		};
	}

	return resolution;
}

async function resolveDocsRedirectFromPaths(opts: {
	branch: string;
	docsRoot: string;
	redirectFromPaths: Array<string>;
	repo: string;
}) {
	const docsPaths = opts.redirectFromPaths.filter(Boolean);

	if (docsPaths.length === 0) {
		return null;
	}

	return resolveDocsRedirect({
		repo: opts.repo,
		branch: opts.branch,
		docsRoot: opts.docsRoot,
		docsPaths,
	});
}

function isDocsNotFoundError(error: unknown) {
	return isNotFound(error) || (error && typeof error === 'object' && 'isNotFound' in error);
}

export async function resolveDocsRedirect(opts: {
	repo: string;
	branch: string;
	docsRoot: string;
	docsPaths: Array<string>;
}) {
	return fetchDocsRedirect({ data: opts });
}

export {
	buildDocsMarkdownRedirectHref,
	buildDocsRedirectHref,
	fetchFile,
	fetchRepoDirectoryContents,
};
