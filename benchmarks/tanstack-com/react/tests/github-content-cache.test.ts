import assert from 'node:assert/strict';
import {
	runWithHostRuntimeContext,
	runWithHostRuntimeEnv,
} from '../src/server/runtime/host.server';
import {
	getCachedDocsArtifact,
	getCachedGitHubJsonContent,
	getCachedGitHubTextFile,
	markDocsArtifactsStale,
	markGitHubContentStale,
	pruneStaleCacheRows,
	resetGitHubContentCacheForTest,
} from '../src/utils/github-content-cache.server';
import { createMockR2Bucket } from './github-cache-test-utils';

const repo = 'tanstack/router';
const gitRef = 'main';

function isStringArray(value: unknown): value is Array<string> {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

async function withTimeout(promise: Promise<void>, message: string) {
	await Promise.race([
		promise,
		new Promise<void>((_, reject) => {
			setTimeout(() => reject(new Error(message)), 1000);
		}),
	]);
}

function isDocsManifest(value: unknown): value is { paths: Array<string> } {
	if (!isObject(value)) {
		return false;
	}

	return isStringArray(value.paths);
}

async function testMissStoresContent() {
	resetGitHubContentCacheForTest();

	let originCalls = 0;
	const result = await getCachedGitHubTextFile({
		repo,
		gitRef,
		path: 'docs/guide.md',
		origin: async () => {
			originCalls += 1;
			return 'guide';
		},
	});

	assert.equal(result, 'guide');
	assert.equal(originCalls, 1);
}

async function testFreshHitSkipsOrigin() {
	resetGitHubContentCacheForTest();

	let originCalls = 0;
	const opts = {
		repo,
		gitRef,
		path: 'docs/fresh.md',
		origin: async () => {
			originCalls += 1;
			return 'fresh';
		},
	};

	assert.equal(await getCachedGitHubTextFile(opts), 'fresh');
	assert.equal(await getCachedGitHubTextFile(opts), 'fresh');
	assert.equal(originCalls, 1);
}

async function testWorkerEnvUsesBlobStorage() {
	resetGitHubContentCacheForTest();

	const mockR2 = createMockR2Bucket();
	let originCalls = 0;
	const opts = {
		repo,
		gitRef,
		path: 'docs/blob.md',
		origin: async () => {
			originCalls += 1;
			return 'blob';
		},
	};

	const firstResult = await runWithHostRuntimeEnv({ GITHUB_CONTENT_CACHE: mockR2.bucket }, () =>
		getCachedGitHubTextFile(opts),
	);
	const secondResult = await runWithHostRuntimeEnv({ GITHUB_CONTENT_CACHE: mockR2.bucket }, () =>
		getCachedGitHubTextFile(opts),
	);

	assert.equal(firstResult, 'blob');
	assert.equal(secondResult, 'blob');
	assert.equal(originCalls, 1);

	const object = mockR2.objects.get('github:file/tanstack/router/main/docs/blob.md');
	assert.ok(object);
	assert.equal(object.customMetadata?.repo, repo);
	assert.equal(object.customMetadata?.gitRef, gitRef);
	assert.equal(object.customMetadata?.isPresent, 'true');
	assert.deepEqual(JSON.parse(object.value), { value: 'blob' });
}

async function testBlobStorageInfersGithubContentMetadataFromKey() {
	resetGitHubContentCacheForTest();

	const mockR2 = createMockR2Bucket();
	const key = 'github:dir/tanstack/router/main/docs/seeded-tree';
	mockR2.objects.set(key, {
		customMetadata: {},
		uploaded: new Date(),
		value: JSON.stringify({ value: ['docs/index.md'] }),
	});

	let originCalls = 0;
	const result = await runWithHostRuntimeEnv({ GITHUB_CONTENT_CACHE: mockR2.bucket }, () =>
		getCachedGitHubJsonContent({
			repo,
			gitRef,
			path: 'docs/seeded-tree',
			isValue: isStringArray,
			origin: async () => {
				originCalls += 1;
				return ['origin.md'];
			},
		}),
	);

	assert.deepEqual(result, ['docs/index.md']);
	assert.equal(originCalls, 0);
}

async function testForcedStaleRefreshes() {
	resetGitHubContentCacheForTest();

	await getCachedGitHubTextFile({
		repo,
		gitRef,
		path: 'docs/stale.md',
		origin: async () => 'old',
	});

	assert.equal(await markGitHubContentStale({ repo, gitRef }), 1);

	let originCalls = 0;
	const result = await getCachedGitHubTextFile({
		repo,
		gitRef,
		path: 'docs/stale.md',
		origin: async () => {
			originCalls += 1;
			return 'new';
		},
	});

	assert.equal(result, 'new');
	assert.equal(originCalls, 1);
}

async function testNegativeHitSkipsOrigin() {
	resetGitHubContentCacheForTest();

	let originCalls = 0;
	const opts = {
		repo,
		gitRef,
		path: 'docs/missing.md',
		origin: async () => {
			originCalls += 1;
			return null;
		},
	};

	assert.equal(await getCachedGitHubTextFile(opts), null);
	assert.equal(await getCachedGitHubTextFile(opts), null);
	assert.equal(originCalls, 1);
}

async function testJsonNegativeEntryRefreshes() {
	resetGitHubContentCacheForTest();

	let originCalls = 0;
	const opts = {
		repo,
		gitRef,
		path: 'examples/react/missing',
		isValue: isStringArray,
		origin: async () => {
			originCalls += 1;
			return originCalls === 1 ? null : ['examples/react/basic/src/main.tsx'];
		},
	};

	assert.equal(await getCachedGitHubJsonContent(opts), null);
	assert.deepEqual(await getCachedGitHubJsonContent(opts), ['examples/react/basic/src/main.tsx']);
	assert.equal(originCalls, 2);
}

async function testRefreshFailureFallsBackToStaleContent() {
	resetGitHubContentCacheForTest();

	await getCachedGitHubTextFile({
		repo,
		gitRef,
		path: 'docs/outage.md',
		origin: async () => 'cached',
	});

	await markGitHubContentStale({ repo, gitRef });

	const result = await getCachedGitHubTextFile({
		repo,
		gitRef,
		path: 'docs/outage.md',
		origin: async () => {
			throw new Error('GitHub unavailable');
		},
	});

	assert.equal(result, 'cached');
}

async function testJsonContentUsesTypeGuard() {
	resetGitHubContentCacheForTest();

	let originCalls = 0;
	const opts = {
		repo,
		gitRef,
		path: '__github_recursive_tree__',
		isValue: isStringArray,
		origin: async () => {
			originCalls += 1;
			return ['docs/index.md'];
		},
	};

	assert.deepEqual(await getCachedGitHubJsonContent(opts), ['docs/index.md']);
	assert.deepEqual(await getCachedGitHubJsonContent(opts), ['docs/index.md']);
	assert.equal(originCalls, 1);
}

async function testArtifactInvalidationAndPruneDelete() {
	resetGitHubContentCacheForTest();

	await getCachedGitHubTextFile({
		repo,
		gitRef,
		path: 'docs/delete.md',
		origin: async () => 'before-delete',
	});

	await getCachedDocsArtifact({
		repo,
		gitRef,
		docsRoot: 'docs',
		artifactType: 'docs-manifest',
		artifactKey: 'default',
		isValue: isDocsManifest,
		build: async () => ({ paths: ['docs/delete.md'] }),
	});

	assert.equal(await markGitHubContentStale({ repo, gitRef }), 1);
	assert.equal(await markDocsArtifactsStale({ repo, gitRef }), 1);

	const prune = await pruneStaleCacheRows({
		maxAgeMs: -1,
		negativeMaxAgeMs: -1,
	});

	assert.equal(prune.githubContentDeleted, 1);
	assert.equal(prune.docsArtifactDeleted, 1);

	let originCalls = 0;
	const result = await getCachedGitHubTextFile({
		repo,
		gitRef,
		path: 'docs/delete.md',
		origin: async () => {
			originCalls += 1;
			return 'after-delete';
		},
	});

	assert.equal(result, 'after-delete');
	assert.equal(originCalls, 1);
}

async function testStaleArtifactRefreshesInWaitUntil() {
	resetGitHubContentCacheForTest();

	await getCachedDocsArtifact({
		repo,
		gitRef,
		docsRoot: 'docs',
		artifactType: 'docs-manifest',
		artifactKey: 'default',
		isValue: isDocsManifest,
		build: async () => ({ paths: ['old'] }),
	});

	assert.equal(await markDocsArtifactsStale({ repo, gitRef }), 1);

	const waitUntilPromises: Array<Promise<unknown>> = [];
	let buildCalls = 0;
	let resolveRefresh: ((value: { paths: Array<string> }) => void) | undefined;
	let markRefreshStarted: (() => void) | undefined;
	const refreshStarted = new Promise<void>((resolve) => {
		markRefreshStarted = resolve;
	});
	const refreshResult = new Promise<{ paths: Array<string> }>((resolve) => {
		resolveRefresh = resolve;
	});

	const staleResult = await runWithHostRuntimeContext(
		{
			waitUntil(promise: Promise<unknown>) {
				waitUntilPromises.push(promise);
			},
		},
		() =>
			getCachedDocsArtifact({
				repo,
				gitRef,
				docsRoot: 'docs',
				artifactType: 'docs-manifest',
				artifactKey: 'default',
				isValue: isDocsManifest,
				build: () => {
					buildCalls += 1;
					markRefreshStarted?.();
					return refreshResult;
				},
			}),
	);

	assert.deepEqual(staleResult, { paths: ['old'] });
	assert.equal(waitUntilPromises.length, 1);

	await withTimeout(refreshStarted, 'stale artifact refresh did not start in waitUntil');
	assert.equal(buildCalls, 1);

	if (!resolveRefresh) {
		throw new Error('stale artifact refresh resolver was not created');
	}

	resolveRefresh({ paths: ['new'] });
	await Promise.all(waitUntilPromises);

	const freshResult = await getCachedDocsArtifact({
		repo,
		gitRef,
		docsRoot: 'docs',
		artifactType: 'docs-manifest',
		artifactKey: 'default',
		isValue: isDocsManifest,
		build: async () => {
			throw new Error('fresh artifact should not rebuild');
		},
	});

	assert.deepEqual(freshResult, { paths: ['new'] });
}

await testMissStoresContent();
await testFreshHitSkipsOrigin();
await testWorkerEnvUsesBlobStorage();
await testBlobStorageInfersGithubContentMetadataFromKey();
await testForcedStaleRefreshes();
await testNegativeHitSkipsOrigin();
await testJsonNegativeEntryRefreshes();
await testRefreshFailureFallsBackToStaleContent();
await testJsonContentUsesTypeGuard();
await testArtifactInvalidationAndPruneDelete();
await testStaleArtifactRefreshesInWaitUntil();

console.log('github-content-cache tests passed');
