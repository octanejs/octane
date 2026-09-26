import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { digest, toolchain, tree } from '../signal-chat-route/evidence.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const directory = path.resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Pass the build output directory');
assert.ok(process.env.PLAYWRIGHT_EXECUTABLE_PATH, 'Set the authorized Chromium executable');
const buildFile = path.join(directory, 'build-report.json');
const report = JSON.parse(fs.readFileSync(buildFile, 'utf8'));
assert.deepEqual(tree(path.join(repo, 'examples/signal-chat')), report.source);
assert.deepEqual(tree(path.join(directory, 'project')), report.source);
assert.deepEqual(toolchain(repo), report.toolchain);
assert.deepEqual(tree(path.join(directory, 'project/dist'), new Set()), report.artifactFiles);
for (const [file, hash] of Object.entries(report.deliveryInputs))
	assert.equal(digest(fs.readFileSync(path.join(import.meta.dirname, file))), hash, file);
const manifest = JSON.parse(report.clientManifest);
const entries = Object.entries(manifest);
const entryKey = entries.find(([, value]) => value.isEntry)?.[0];
assert.ok(entryKey, 'Missing hydration entry');
const pageFile = manifest['src/App.tsrx'].file;
const metrics = manifest['src/App.tsrx?octane-hydrate=4'];
assert.ok(metrics, 'Missing original Metrics island');
const runtimeKey = metrics.imports.find((key) => key.includes('_runtime-'));
assert.ok(runtimeKey, 'Missing renderer dependency from Metrics');
function closure(start, includeDynamic) {
	const seen = new Set();
	function visit(key) {
		assert.ok(manifest[key], `Missing manifest dependency: ${key}`);
		if (seen.has(key)) return;
		seen.add(key);
		for (const dependency of manifest[key].imports ?? []) visit(dependency);
		if (includeDynamic)
			for (const dependency of manifest[key].dynamicImports ?? []) visit(dependency);
	}
	visit(start);
	return [...seen];
}
function compressed(keys) {
	const files = [
		...new Set(keys.map((key) => manifest[key].file).filter((file) => file.endsWith('.js'))),
	];
	const sizes = Object.fromEntries(
		files.map((file) => {
			const bytes = fs.readFileSync(path.join(directory, 'project/dist/client', file));
			return [file, { raw: bytes.length, gzip9: gzipSync(bytes, { level: 9 }).length }];
		}),
	);
	return {
		files: sizes,
		raw: Object.values(sizes).reduce((sum, item) => sum + item.raw, 0),
		gzip9: Object.values(sizes).reduce((sum, item) => sum + item.gzip9, 0),
	};
}
const staticKeys = closure(entryKey, false);
const reachableKeys = closure(entryKey, true);
assert.ok(!staticKeys.includes(runtimeKey), 'Renderer remains in the static entry closure');
assert.ok(reachableKeys.includes(runtimeKey), 'Renderer fallback must remain reachable');
assert.ok(reachableKeys.includes('src/App.tsrx'), 'Ordinary route must remain reachable');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { chromium } = require('playwright');
const child = fork(
	path.join(repo, 'benchmarks/streamed-shell-prototype/signal-chat-route/server.mjs'),
	[path.join(directory, 'project')],
	{ stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
);
let logs = '';
child.stdout.on('data', (chunk) => {
	logs += String(chunk);
});
child.stderr.on('data', (chunk) => {
	logs += String(chunk);
});
const [message] = await Promise.race([
	once(child, 'message'),
	once(child, 'exit').then(([code]) => {
		throw new Error(`Server exited ${code}: ${logs}`);
	}),
]);
const origin = `http://127.0.0.1:${message.port}`;
const browser = await chromium.launch({
	executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
	headless: true,
});

async function sample(mode) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const requests = [];
	const errors = [];
	page.on('request', (request) => requests.push(request));
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('requestfailed', (request) =>
		errors.push(`${request.url()}: ${request.failure()?.errorText}`),
	);
	page.on('console', (message) => {
		if (!['error', 'warning'].includes(message.type())) return;
		if (message.location().url?.endsWith('/favicon.ico') && message.text().includes('404')) return;
		errors.push(message.text());
	});
	const url = new URL(mode === 'eager' ? '/eager' : '/', origin);
	for (const [name, value] of Object.entries({
		auth: '40',
		answer: '60',
		history: '120',
		interval: '30',
		waves: '4',
		turns: '20',
		historyRows: '10',
	}))
		url.searchParams.set(name, value);
	if (mode === 'ordinary') url.searchParams.set('__ordinaryRoot', '1');
	try {
		const document = await page.goto(url.href, { waitUntil: 'load' });
		assert.ok(document);
		await page.waitForFunction(
			() => globalThis.__octaneIslandsFirstCheckpoint?.preHydrateCompleted === true,
		);
		await page.waitForFunction(() =>
			document.querySelector('.observation-log')?.textContent?.includes('metrics · activated'),
		);
		await page.waitForLoadState('networkidle');
		const selected = await page.evaluate(() => globalThis.__octaneIslandsFirstCheckpoint);
		assert.equal(selected.selection, mode === 'candidate' ? 'islands-first' : 'ordinary');
		assert.equal(selected.registryStarts, 1);
		assert.equal(selected.rootHydrateCalls, mode === 'candidate' ? 0 : 1);
		const html = await document.text();
		const preload = `<link rel="modulepreload" href="/${pageFile}">`;
		assert.equal(html.includes(preload), mode !== 'candidate', 'Page preload selection');
		async function network() {
			return Promise.all(
				requests.map(async (request) => {
					const response = await request.response();
					assert.ok(response, `Missing response: ${request.url()}`);
					const headers = await response.allHeaders();
					return {
						path: new URL(request.url()).pathname,
						type: request.resourceType(),
						status: response.status(),
						encoding: headers['content-encoding'] ?? null,
						...(await request.sizes()),
					};
				}),
			);
		}
		const startup = await network();
		assert.equal(
			startup.some((item) => item.path === `/${pageFile}`),
			mode !== 'candidate',
			'Page request selection',
		);
		assert.ok(
			startup.some((item) => item.path === `/${metrics.file}`),
			'Metrics must activate',
		);
		assert.ok(
			startup.some((item) => item.path === `/${manifest[runtimeKey].file}`),
			'Metrics must load the renderer',
		);
		if (mode !== 'eager') {
			await page.getByRole('button', { name: 'Activate conversation', exact: true }).click();
			await page.waitForFunction(
				() => document.querySelector('[data-answer]')?.getAttribute('data-revision') === '4',
			);
			await page.waitForLoadState('networkidle');
		}
		const afterInteraction = await network();
		assert.deepEqual(errors, []);
		return { mode, selected, preload: html.includes(preload), startup, afterInteraction };
	} finally {
		await context.close();
	}
}

try {
	const samples = [];
	for (const mode of ['candidate', 'ordinary', 'eager']) samples.push(await sample(mode));
	assert.equal(logs, '', 'Unexpected server diagnostics');
	const output = {
		buildReportSha256: digest(fs.readFileSync(buildFile)),
		browser: browser.version(),
		node: process.version,
		graph: {
			entry: manifest[entryKey].file,
			runtime: manifest[runtimeKey].file,
			page: pageFile,
			static: compressed(staticKeys),
			reachable: compressed(reachableKeys),
		},
		samples,
	};
	const file = path.join(directory, 'delivery-report.json');
	fs.writeFileSync(file, JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
	console.log(
		JSON.stringify(
			{ file, browser: output.browser, modes: samples.map((item) => item.mode) },
			null,
			2,
		),
	);
} finally {
	await browser.close();
	if (child.exitCode === null && child.signalCode === null) {
		const exited = once(child, 'exit');
		child.kill();
		await exited;
	}
}
