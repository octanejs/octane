import assert from 'node:assert/strict';
import { runWithHostRuntimeEnv } from '../src/server/runtime/host.server';
import { fetchApiContents } from '../src/utils/documents.server';
import { resetGitHubContentCacheForTest } from '../src/utils/github-content-cache.server';
import { createMockR2Bucket } from './github-cache-test-utils';
import type { GitHubFileNode } from '../src/utils/documents.server';

const repo = 'tanstack/router';
const gitRef = 'main';
const startingPath = 'examples/react/kitchen-sink';

async function testCachedRecursiveTreeBuildsDirectory() {
	resetGitHubContentCacheForTest();

	const mockR2 = createMockR2Bucket();
	mockR2.objects.set('github:dir/tanstack/router/main/__github_recursive_tree__', {
		customMetadata: {},
		uploaded: new Date(),
		value: JSON.stringify({
			value: {
				sha: 'root-sha',
				tree: [
					{
						path: startingPath,
						sha: 'example-sha',
						type: 'tree',
						url: 'https://api.github.com/tree/example-sha',
					},
					{
						path: `${startingPath}/package.json`,
						sha: 'package-sha',
						size: 100,
						type: 'blob',
						url: 'https://api.github.com/blob/package-sha',
					},
					{
						path: `${startingPath}/src`,
						sha: 'src-sha',
						type: 'tree',
						url: 'https://api.github.com/tree/src-sha',
					},
					{
						path: `${startingPath}/src/main.tsx`,
						sha: 'main-sha',
						size: 200,
						type: 'blob',
						url: 'https://api.github.com/blob/main-sha',
					},
				],
				truncated: false,
				url: 'https://api.github.com/tree/root-sha',
			},
		}),
	});

	const contents: Array<GitHubFileNode> | null = await runWithHostRuntimeEnv(
		{ GITHUB_CONTENT_CACHE: mockR2.bucket },
		() => fetchApiContents(repo, gitRef, startingPath),
	);

	assert.ok(contents);
	assert.deepEqual(
		contents.map((node) => node.name),
		['src', 'package.json'],
	);

	const src = contents.find((node) => node.name === 'src');
	assert.ok(src?.children);
	assert.deepEqual(
		src.children.map((node) => node.name),
		['main.tsx'],
	);

	const persistedDirectory = mockR2.objects.get(
		'github:dir/tanstack/router/main/examples/react/kitchen-sink',
	);
	assert.ok(persistedDirectory);
	assert.equal(persistedDirectory.customMetadata?.repo, repo);
	assert.equal(persistedDirectory.customMetadata?.gitRef, gitRef);
	assert.equal(persistedDirectory.customMetadata?.isPresent, 'true');
}

function createTableContentsApiFetchMock(requestedUrls: Array<string>) {
	return async (input: string | URL | Request) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

		requestedUrls.push(url);

		if (url.includes('/contents/examples/react/basic/src')) {
			return Response.json([
				{
					name: 'main.tsx',
					path: 'examples/react/basic/src/main.tsx',
					type: 'file',
					_links: {
						self: 'https://api.github.com/repos/tanstack/table/contents/examples/react/basic/src/main.tsx',
					},
				},
			]);
		}

		if (url.includes('/contents/examples/react/basic')) {
			return Response.json([
				{
					name: 'src',
					path: 'examples/react/basic/src',
					type: 'dir',
					_links: {
						self: 'https://api.github.com/repos/tanstack/table/contents/examples/react/basic/src',
					},
				},
				{
					name: 'package.json',
					path: 'examples/react/basic/package.json',
					type: 'file',
					_links: {
						self: 'https://api.github.com/repos/tanstack/table/contents/examples/react/basic/package.json',
					},
				},
			]);
		}

		return new Response('not found', { status: 404 });
	};
}

async function assertTableFallbackContents(
	tableMockR2: ReturnType<typeof createMockR2Bucket>,
	requestedUrls: Array<string>,
) {
	const tableRepo = 'tanstack/table';
	const tableStartingPath = 'examples/react/basic';

	const fallbackContents: Array<GitHubFileNode> | null = await runWithHostRuntimeEnv(
		{ GITHUB_CONTENT_CACHE: tableMockR2.bucket },
		() => fetchApiContents(tableRepo, gitRef, tableStartingPath),
	);

	assert.ok(fallbackContents);
	assert.deepEqual(
		fallbackContents.map((node) => node.name),
		['src', 'package.json'],
	);

	const srcNode = fallbackContents.find((node) => node.name === 'src');
	assert.ok(srcNode?.children);
	assert.deepEqual(
		srcNode.children.map((node) => node.path),
		['examples/react/basic/src/main.tsx'],
	);

	assert.ok(requestedUrls.some((url) => url.includes('/contents/examples/react/basic?ref=main')));

	const persistedFallbackDirectory = tableMockR2.objects.get(
		'github:dir/tanstack/table/main/examples/react/basic',
	);
	assert.ok(persistedFallbackDirectory);
	assert.equal(persistedFallbackDirectory.customMetadata?.isPresent, 'true');
}

async function testContentsApiFallbackWhenRecursiveTreeMissesPath() {
	resetGitHubContentCacheForTest();

	const tableMockR2 = createMockR2Bucket();
	const requestedUrls: Array<string> = [];
	tableMockR2.objects.set('github:dir/tanstack/table/main/__github_recursive_tree__', {
		customMetadata: {},
		uploaded: new Date(),
		value: JSON.stringify({
			value: {
				sha: 'root-sha',
				tree: [
					{
						path: 'examples/react/other-example',
						sha: 'other-example-sha',
						type: 'tree',
						url: 'https://api.github.com/tree/other-example-sha',
					},
				],
				truncated: false,
				url: 'https://api.github.com/tree/root-sha',
			},
		}),
	});

	const originalFetch = globalThis.fetch;
	globalThis.fetch = createTableContentsApiFetchMock(requestedUrls);

	try {
		await assertTableFallbackContents(tableMockR2, requestedUrls);
		assert.ok(!requestedUrls.some((url) => url.includes('/git/trees/')));
	} finally {
		globalThis.fetch = originalFetch;
	}
}

async function testContentsApiFallbackWhenRecursiveTreeFails() {
	resetGitHubContentCacheForTest();

	const tableMockR2 = createMockR2Bucket();
	const originalFetch = globalThis.fetch;
	const requestedUrls: Array<string> = [];
	const contentsApiFetch = createTableContentsApiFetchMock(requestedUrls);

	globalThis.fetch = async (input: string | URL | Request) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

		requestedUrls.push(url);

		if (url.includes('/git/trees/')) {
			return new Response('rate limited', { status: 403 });
		}

		return contentsApiFetch(input);
	};

	try {
		await assertTableFallbackContents(tableMockR2, requestedUrls);
		assert.ok(requestedUrls.some((url) => url.includes('/git/trees/')));
	} finally {
		globalThis.fetch = originalFetch;
	}
}

await testCachedRecursiveTreeBuildsDirectory();
await testContentsApiFallbackWhenRecursiveTreeMissesPath();
await testContentsApiFallbackWhenRecursiveTreeFails();

console.log('github-api-contents-cache tests passed');
