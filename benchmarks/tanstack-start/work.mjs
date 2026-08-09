// Deterministic real-HTTP work gate for the production Start application.
// Response-size budgets only count after visible route content, HTTP statuses,
// streaming behavior, and managed-asset identity match the React control.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants, gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import {
	getFreePort,
	spawnServer,
	stopServer,
	timedGet,
	waitForListen,
} from '../lib/http-timing.mjs';
import { FLAVORS } from './serve-both.mjs';

const ROOT = process.env.START_WORK_TARGET_DIR || path.dirname(fileURLToPath(import.meta.url));
const DEFER_MS = 40;
const MAX_MANAGED_KEY_LENGTH = 96;

const ROUTES = [
	{
		name: 'home',
		path: '/',
		status: 200,
		managedAssets: 25,
		maxRawBytes: 11_000,
		maxGzipBytes: 1_900,
	},
	{
		name: 'posts',
		path: '/posts',
		status: 200,
		managedAssets: 26,
		maxRawBytes: 17_000,
		maxGzipBytes: 2_500,
	},
	{ name: 'post', path: '/posts/3', status: 200 },
	{ name: 'not_found', path: '/posts/i-do-not-exist', status: 404 },
	{
		name: 'deferred',
		path: '/deferred',
		status: 200,
		managedAssets: 25,
		maxRawBytes: 14_000,
		maxGzipBytes: 2_900,
	},
];

const TARGETS = ['react', 'octane-minimal', 'octane-nitro'];

function assert(condition, message) {
	if (!condition) throw new Error(`tanstack-start-work verify failed: ${message}`);
}

async function startTarget(name) {
	const flavor = FLAVORS[name];
	const port = await getFreePort();
	const { child, logs } = spawnServer(flavor.command, flavor.args, {
		cwd: path.join(ROOT, flavor.dir),
		env: { PORT: String(port), BENCH_DEFER_MS: String(DEFER_MS) },
	});
	try {
		await waitForListen(port, child, { logs });
		return { name, child, baseURL: `http://127.0.0.1:${port}` };
	} catch (error) {
		await stopServer(child);
		throw error;
	}
}

function semanticSnapshot(route, response, target) {
	assert(
		response.status === route.status,
		`${target} ${route.path}: expected HTTP ${route.status}, received ${response.status}`,
	);
	const document = new JSDOM(response.body).window.document;
	const navigation = Array.from(
		document.querySelectorAll('[data-testid="root-nav"] a'),
		(link) => ({
			href: link.getAttribute('href'),
			text: link.textContent.trim(),
		}),
	);
	assert(
		JSON.stringify(navigation) ===
			JSON.stringify([
				{ href: '/', text: 'Home' },
				{ href: '/posts', text: 'Posts' },
				{ href: '/deferred', text: 'Deferred' },
			]),
		`${target} ${route.path}: shared root navigation changed`,
	);

	const snapshot = { title: document.title, navigation };
	if (route.name === 'home') {
		snapshot.heading = document.querySelector('h3')?.textContent.trim();
		assert(snapshot.heading === 'Welcome Home!!!', `${target}: home heading changed`);
	}
	if (route.name === 'posts' || route.name === 'post' || route.name === 'not_found') {
		const links = Array.from(document.querySelectorAll('a[href^="/posts/"]'), (link) => ({
			href: link.getAttribute('href'),
			text: link.textContent.trim(),
		}));
		snapshot.links = links;
		assert(
			links.length === 11,
			`${target} ${route.path}: expected 11 post links, found ${links.length}`,
		);
		assert(links[2]?.href === '/posts/3', `${target} ${route.path}: the third post link changed`);
		snapshot.parentCounter = document
			.querySelector('[data-testid="posts-parent-hydration-counter"]')
			?.textContent.trim();
		assert(
			snapshot.parentCounter === 'Parent hydration count: 0',
			`${target} ${route.path}: initial parent state changed`,
		);
	}
	if (route.name === 'posts') {
		snapshot.index = document
			.querySelector('[data-testid="PostsIndexComponent"]')
			?.textContent.trim();
		assert(snapshot.index === 'Select a post.', `${target}: posts index changed`);
	}
	if (route.name === 'post') {
		assert(
			response.body.includes('Post 3: deterministic title C'),
			`${target}: third post title missing`,
		);
		assert(response.body.includes('Body of post 3.'), `${target}: third post body missing`);
		snapshot.postBody = 'Body of post 3.';
	}
	if (route.name === 'not_found') {
		const missing = document.querySelector('[data-testid="default-not-found-component"]');
		assert(
			missing?.textContent.includes('Post not found'),
			`${target}: not-found boundary missing`,
		);
		snapshot.notFound = 'Post not found';
	}
	if (route.name === 'deferred') {
		snapshot.regular = document.querySelector('[data-testid="regular-person"]')?.textContent.trim();
		snapshot.count = document.querySelector('[data-testid="deferred-count"]')?.textContent.trim();
		assert(snapshot.regular === 'John Doe - 4', `${target}: immediate deferred data changed`);
		assert(snapshot.count === 'Count: 0', `${target}: initial deferred state changed`);
		assert(response.body.includes('Tanner Linsley'), `${target}: delayed person never streamed`);
		assert(response.body.includes('Hello deferred!'), `${target}: delayed text never streamed`);
		assert(response.chunks.length >= 3, `${target}: deferred response was buffered`);
		assert(
			!response.firstChunk.includes('Hello deferred!'),
			`${target}: deferred text arrived in the initial shell`,
		);
		assert(
			response.totalMs - response.ttfbMs >= DEFER_MS,
			`${target}: deferred response did not preserve its asynchronous floor`,
		);
	}

	const managedAssets = Array.from(
		document.querySelectorAll('[data-tsr-managed-key]'),
		(element) => ({
			tag: element.localName,
			key: element.getAttribute('data-tsr-managed-key'),
		}),
	);
	return { snapshot, managedAssets };
}

const servers = [];
const failures = [];
const results = {};

try {
	for (const target of TARGETS) servers.push(await startTarget(target));
	for (const route of ROUTES) {
		let reference;
		for (const server of servers) {
			const response = await timedGet(server.baseURL + route.path);
			const { snapshot, managedAssets } = semanticSnapshot(route, response, server.name);
			if (reference === undefined) {
				reference = snapshot;
			} else {
				assert(
					JSON.stringify(snapshot) === JSON.stringify(reference),
					`${server.name} ${route.path}: visible route state differs from React`,
				);
			}

			const contents = Buffer.from(response.body);
			const metric = {
				status: response.status,
				rawBytes: contents.length,
				gzipBytes: gzipSync(contents, { level: constants.Z_BEST_COMPRESSION }).length,
				chunks: response.chunks.length,
				managedAssets: managedAssets.length,
				maxManagedKeyLength: Math.max(0, ...managedAssets.map((asset) => asset.key.length)),
			};
			(results[server.name] ??= {})[route.name] = metric;

			if (server.name === 'react') continue;
			assert(managedAssets.length > 0, `${server.name} ${route.path}: managed assets disappeared`);
			if (route.managedAssets !== undefined) {
				assert(
					managedAssets.length === route.managedAssets,
					`${server.name} ${route.path}: expected ${route.managedAssets} managed assets, found ${managedAssets.length}`,
				);
			}
			const uniqueKeys = new Set(managedAssets.map((asset) => asset.key));
			assert(
				uniqueKeys.size === managedAssets.length,
				`${server.name} ${route.path}: managed assets reuse a hydration identity`,
			);
			if (metric.maxManagedKeyLength > MAX_MANAGED_KEY_LENGTH) {
				failures.push(
					`${server.name} ${route.path}: managed key ${metric.maxManagedKeyLength} > ${MAX_MANAGED_KEY_LENGTH}`,
				);
			}
			if (route.maxRawBytes !== undefined && metric.rawBytes > route.maxRawBytes) {
				failures.push(
					`${server.name} ${route.path}: HTML ${metric.rawBytes} > ${route.maxRawBytes}`,
				);
			}
			if (route.maxGzipBytes !== undefined && metric.gzipBytes > route.maxGzipBytes) {
				failures.push(
					`${server.name} ${route.path}: gzip ${metric.gzipBytes} > ${route.maxGzipBytes}`,
				);
			}
		}
	}
} finally {
	for (const server of servers.reverse()) await stopServer(server.child);
}

for (const [target, routes] of Object.entries(results)) {
	for (const [route, result] of Object.entries(routes)) {
		console.log(
			`${target} ${route}: ${result.rawBytes} raw, ${result.gzipBytes} gzip, ` +
				`${result.managedAssets} managed assets, maximum key ${result.maxManagedKeyLength}`,
		);
	}
}

if (process.env.WORK_JSON) {
	fs.writeFileSync(
		process.env.WORK_JSON,
		JSON.stringify({ suite: 'tanstack-start-work', results, failures }, null, '\t') + '\n',
	);
}

if (failures.length > 0) {
	console.error(failures.join('\n'));
	process.exitCode = 1;
} else {
	console.log('tanstack-start production work gate: PASS');
}
