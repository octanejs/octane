import assert from 'node:assert/strict';
import {
	buildDocsMarkdownRedirectHref,
	buildDocsRedirectHref,
	resolveDocsPathRedirect,
	type DocsRedirectManifest,
} from '../src/utils/docs-redirects';
import { publicLibraries } from '../src/libraries';

const expectedLegacyOverviewTargets: Record<string, string | null> = {
	ai: 'getting-started/overview',
	cli: null,
	config: null,
	db: 'framework/react/overview',
	devtools: 'overview',
	form: 'overview',
	hotkeys: 'overview',
	intent: null,
	pacer: 'overview',
	query: 'framework/react/overview',
	ranger: 'overview',
	router: 'overview',
	start: 'framework/react/overview',
	store: 'overview',
	table: 'overview',
	virtual: 'introduction',
};

function manifestWithPaths(paths: Array<string>): DocsRedirectManifest {
	return {
		paths,
		redirects: {},
	};
}

function assertRedirectsTo(opts: {
	defaultDocs: string;
	docsPath: string;
	expectedTarget: string;
	frameworks: Array<string>;
	manifest: DocsRedirectManifest;
}) {
	assert.deepEqual(
		resolveDocsPathRedirect({
			defaultDocs: opts.defaultDocs,
			docsPath: opts.docsPath,
			frameworks: opts.frameworks,
			manifest: opts.manifest,
		}),
		{ type: 'redirect', docsPath: opts.expectedTarget },
	);
}

function assertNotFound(opts: {
	defaultDocs: string;
	docsPath: string;
	frameworks: Array<string>;
	manifest: DocsRedirectManifest;
}) {
	assert.deepEqual(
		resolveDocsPathRedirect({
			defaultDocs: opts.defaultDocs,
			docsPath: opts.docsPath,
			frameworks: opts.frameworks,
			manifest: opts.manifest,
		}),
		{ type: 'not-found' },
	);
}

for (const library of publicLibraries) {
	assert.ok(
		Object.hasOwn(expectedLegacyOverviewTargets, library.id),
		`${library.id} must have a docs/react/overview redirect expectation`,
	);

	const expectedTarget = expectedLegacyOverviewTargets[library.id];
	const defaultDocs = library.defaultDocs ?? 'overview';
	const paths = expectedTarget ? [expectedTarget] : [defaultDocs];
	const manifest = manifestWithPaths(paths);

	if (expectedTarget) {
		assertRedirectsTo({
			defaultDocs,
			docsPath: 'react/overview',
			expectedTarget,
			frameworks: library.frameworks,
			manifest,
		});
	} else {
		assertNotFound({
			defaultDocs,
			docsPath: 'react/overview',
			frameworks: library.frameworks,
			manifest,
		});
	}

	assert.deepEqual(
		resolveDocsPathRedirect({
			defaultDocs,
			docsPath: defaultDocs,
			frameworks: library.frameworks,
			manifest: manifestWithPaths([defaultDocs]),
		}),
		{ type: 'render', docsPath: defaultDocs },
		`${library.id} canonical default docs render without redirect`,
	);
}

assertRedirectsTo({
	defaultDocs: 'overview',
	docsPath: 'framework/react/overview',
	expectedTarget: 'overview',
	frameworks: ['react', 'solid'],
	manifest: manifestWithPaths(['overview']),
});

assertRedirectsTo({
	defaultDocs: 'overview',
	docsPath: 'framework/react/guide/search-params',
	expectedTarget: 'guide/search-params',
	frameworks: ['react', 'solid'],
	manifest: manifestWithPaths(['guide/search-params']),
});

assertRedirectsTo({
	defaultDocs: 'overview',
	docsPath: 'react/guide/search-params',
	expectedTarget: 'framework/react/guide/search-params',
	frameworks: ['react', 'solid'],
	manifest: manifestWithPaths(['framework/react/guide/search-params', 'guide/search-params']),
});

assertNotFound({
	defaultDocs: 'overview',
	docsPath: 'ember/overview',
	frameworks: ['react', 'solid'],
	manifest: manifestWithPaths(['overview', 'framework/react/overview']),
});

assertNotFound({
	defaultDocs: 'overview',
	docsPath: 'framework/ember/overview',
	frameworks: ['react', 'solid'],
	manifest: manifestWithPaths(['overview', 'framework/react/overview']),
});

assertNotFound({
	defaultDocs: 'overview',
	docsPath: 'react/guide/does-not-exist',
	frameworks: ['react', 'solid'],
	manifest: manifestWithPaths(['overview', 'framework/react/overview']),
});

assertRedirectsTo({
	defaultDocs: 'overview',
	docsPath: 'react/overview',
	expectedTarget: 'overview',
	frameworks: [],
	manifest: {
		paths: ['overview'],
		redirects: {
			'react/overview': 'overview',
		},
	},
});

assertNotFound({
	defaultDocs: 'overview',
	docsPath: 'react/overview',
	frameworks: [],
	manifest: manifestWithPaths(['overview']),
});

assertRedirectsTo({
	defaultDocs: 'overview',
	docsPath: 'reference/type-aliases/RemovedType',
	expectedTarget: 'reference',
	frameworks: ['react'],
	manifest: manifestWithPaths(['overview', 'reference']),
});

assert.equal(
	buildDocsRedirectHref({
		baseHref: '/query/v5/docs/react/overview?pm=pnpm#motivation',
		docsPath: 'framework/react/overview',
		libraryId: 'query',
		version: 'v5',
	}),
	'/query/v5/docs/framework/react/overview?pm=pnpm#motivation',
);

assert.equal(
	buildDocsMarkdownRedirectHref({
		requestUrl: 'https://tanstack.com/query/v5/docs/react/overview.md?pm=pnpm#motivation',
		docsPath: 'framework/react/overview',
		libraryId: 'query',
		version: 'v5',
	}),
	'https://tanstack.com/query/v5/docs/framework/react/overview.md?pm=pnpm#motivation',
);

console.log('docs redirect tests passed');
