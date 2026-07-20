import assert from 'node:assert/strict';
import test from 'node:test';
import {
	collectRedirectEntriesForFile,
	mapWithConcurrency,
	type DocsTreeNode,
} from '../src/utils/docs.functions';
import { GitHubContentError } from '../src/utils/documents.server';

test('mapWithConcurrency preserves result order regardless of completion order', async () => {
	const delays = [30, 5, 20, 1, 15];

	const results = await mapWithConcurrency(delays, 3, async (delay) => {
		await new Promise((resolve) => setTimeout(resolve, delay));
		return delay;
	});

	assert.deepEqual(results, delays);
});

test('mapWithConcurrency bounds concurrency instead of running everything in parallel', async () => {
	const items = Array.from({ length: 12 }, (_, index) => index);
	let inFlight = 0;
	let maxInFlight = 0;

	await mapWithConcurrency(items, 4, async () => {
		inFlight += 1;
		maxInFlight = Math.max(maxInFlight, inFlight);
		await new Promise((resolve) => setTimeout(resolve, 10));
		inFlight -= 1;
	});

	assert.ok(maxInFlight <= 4, `expected at most 4 concurrent calls, saw ${maxInFlight}`);
	assert.equal(maxInFlight, 4, 'expected concurrency to reach the cap');
});

test('mapWithConcurrency runs in a bounded number of batches, not one call per item', async () => {
	const items = Array.from({ length: 18 }, (_, index) => index);
	const perItemDelayMs = 20;
	const concurrency = 6;

	const start = Date.now();
	await mapWithConcurrency(items, concurrency, async () => {
		await new Promise((resolve) => setTimeout(resolve, perItemDelayMs));
	});
	const elapsed = Date.now() - start;

	const sequentialWorstCase = items.length * perItemDelayMs;
	assert.ok(
		elapsed < sequentialWorstCase / 2,
		`expected concurrent execution well under ${sequentialWorstCase}ms, took ${elapsed}ms`,
	);
});

console.log('docs manifest concurrency tests passed');

test('collectRedirectEntriesForFile returns no entries (not a rejection) when the file fetch throws a recoverable GitHub error', async () => {
	const node: DocsTreeNode = { path: 'docs/guide/old-page.md' };
	const paths: Array<string> = [];

	const entries = await collectRedirectEntriesForFile(node, {
		docsRoot: 'docs',
		fetchFile: async () => {
			throw new GitHubContentError('rate-limit', 'GitHub rate limited this file');
		},
		onCanonicalPath: (path) => paths.push(path),
	});

	assert.deepEqual(entries, []);
	assert.deepEqual(paths, ['guide/old-page']);
});

test('collectRedirectEntriesForFile rethrows non-recoverable errors instead of silently swallowing them', async () => {
	const node: DocsTreeNode = { path: 'docs/guide/old-page.md' };

	await assert.rejects(
		() =>
			collectRedirectEntriesForFile(node, {
				docsRoot: 'docs',
				fetchFile: async () => {
					throw new TypeError('this is a real bug, not a flaky GitHub call');
				},
				onCanonicalPath: () => {},
			}),
		TypeError,
	);
});

test('a mix of one failing file and several succeeding files still produces every succeeding redirect', async () => {
	const nodes: Array<DocsTreeNode> = [
		{ path: 'docs/guide/a.md' },
		{ path: 'docs/guide/flaky.md' },
		{ path: 'docs/guide/b.md' },
	];

	const fileContents: Record<string, string> = {
		'docs/guide/a.md': '---\nredirect_from:\n  - guide/old-a\n---\n# A',
		'docs/guide/b.md': '---\nredirect_from:\n  - guide/old-b\n---\n# B',
	};

	const paths: Array<string> = [];

	const results = await mapWithConcurrency(nodes, 3, (node) =>
		collectRedirectEntriesForFile(node, {
			docsRoot: 'docs',
			fetchFile: async (filePath) => {
				if (filePath === 'docs/guide/flaky.md') {
					throw new GitHubContentError('server', 'GitHub 5xx for this file');
				}

				return fileContents[filePath] ?? null;
			},
			onCanonicalPath: (path) => paths.push(path),
		}),
	);

	// The whole build did not reject just because one file was flaky.
	assert.deepEqual(
		results.flat().map((entry) => entry.from),
		['guide/old-a', 'guide/old-b'],
	);
	// All three files' paths were still recorded, including the flaky one.
	assert.deepEqual(paths.sort(), ['guide/a', 'guide/b', 'guide/flaky']);
});

console.log('buildDocsManifest per-file fault tolerance tests passed');
