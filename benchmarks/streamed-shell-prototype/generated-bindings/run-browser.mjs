import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from './build.mjs';
import { startServer } from '../../conversation-streaming/behavior-only/build.mjs';

const require = createRequire(
	path.resolve(import.meta.dirname, '../../../packages/octane/package.json'),
);
const { chromium } = require('playwright');
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
assert.ok(executablePath, 'Set PLAYWRIGHT_EXECUTABLE_PATH to the explicitly authorized browser');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const browser = await chromium.launch({ executablePath, headless: true });
const reports = [];
let baseline, candidate;
try {
	baseline = await build('renderer');
	candidate = await build('bindings');
	assert.equal(baseline.server.sha256, candidate.server.sha256, 'SSR output differs');
	const baselineModules = Object.values(baseline.outputs).flatMap((chunk) =>
		Object.keys(chunk.modules),
	);
	assert.ok(
		!baselineModules.some(
			(file) =>
				file.includes('?octane-bindings=') ||
				file.endsWith('/preflight.ts') ||
				file.endsWith('/adapter.tsrx'),
		),
		'ordinary baseline must not import binding artifacts',
	);
	for (const [file, hash] of Object.entries(baseline.inputHashes)) {
		if (candidate.inputHashes[file] !== undefined)
			assert.equal(candidate.inputHashes[file], hash, `Input changed between builds: ${file}`);
	}
	for (const [name, report] of [
		['baseline', baseline],
		['bindings', candidate],
		['fallback', candidate],
		['mismatch-stamp', candidate],
		['mismatch-slot', candidate],
		['mismatch-marker', candidate],
		['mismatch-nested', candidate],
		['retire', candidate],
	]) {
		const server = await startServer(report);
		const context = await browser.newContext();
		const page = await context.newPage();
		const errors = [],
			requests = [];
		const run = randomUUID();
		let releaseAsset;
		const gate = new Promise((resolve) => {
			releaseAsset = resolve;
		});
		let assetRequest;
		let rendererChunk;
		let beforeHTML;
		page.setDefaultTimeout(20000);
		page.on('pageerror', (error) => errors.push(String(error)));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		page.on('request', (request) => {
			if (request.url().includes('/assets/')) requests.push(request.url().split('/assets/')[1]);
		});
		try {
			if (name === 'fallback' || name === 'retire') {
				await page.addInitScript(() => {
					window.__automaticPreferRenderer = true;
				});
				rendererChunk = Object.keys(report.outputs).find((file) => file.includes('/renderer-'));
				assert.ok(rendererChunk, 'Fallback chunk is emitted');
				await page.route(`**/assets/${rendererChunk}`, async (route) => {
					await gate;
					await route.continue();
				});
				assetRequest = page.waitForRequest(`**/assets/${rendererChunk}`);
			} else if (name.startsWith('mismatch') || name === 'baseline' || name === 'bindings') {
				await page.route('**/assets/behavior.js', async (route) => {
					await gate;
					await route.continue();
				});
				assetRequest = page.waitForRequest('**/assets/behavior.js');
			}
			await page.goto(`${server.url}/?run=${run}&scenario=rich-waves`, { waitUntil: 'commit' });
			if (assetRequest) await assetRequest;
			await page.locator('#automatic-status').waitFor();
			await page.evaluate(() => {
				window.__automaticInitialRoot = document.getElementById('automatic-status');
			});
			if (name.startsWith('mismatch')) {
				if (name === 'mismatch-stamp')
					await page
						.locator('#automatic-status')
						.evaluate((root) => root.setAttribute('data-octane-bindings', 'wrong-stamp'));
				else if (name === 'mismatch-slot')
					await page
						.locator('#automatic-slot')
						.evaluate((slot) => slot.append(document.createTextNode('unexpected')));
				else if (name === 'mismatch-marker')
					await page.locator('#automatic-slot').evaluate((slot) => {
						slot.firstChild.nodeValue = 'unknown';
					});
				else
					await page
						.locator('#automatic-status h1')
						.evaluate((h1) => h1.append(document.createComment('unknown')));
				beforeHTML = await page.locator('#automatic-slot').innerHTML();
				releaseAsset();
			} else if (name === 'baseline' || name === 'bindings') {
				beforeHTML = await page.locator('#automatic-slot').innerHTML();
				releaseAsset();
			}
			if (name === 'fallback' || name === 'retire') {
				assert.equal((await page.evaluate(() => window.__automaticProbe())).subscriptions, 0);
				assert.equal((await page.evaluate(() => window.__automaticProbe())).aborted, false);
				await page.locator('#draft').fill('typed before fallback');

				await page.waitForFunction(async (id) => {
					const trace = await (await fetch(`/trace?run=${id}`)).json();
					return trace.requests.some((request) =>
						request.events.some((event) => event.event === 'auth:held'),
					);
				}, run);
				await page.evaluate(async (id) => {
					const r = await fetch(`/release?run=${id}`, { method: 'POST' });
					if (!r.ok) throw Error(`release: ${r.status}`);
				}, run);
				await page.waitForFunction(() => {
					const probe = window.__automaticProbe();
					return (
						probe.bodyRevision === 4 &&
						probe.historyRevision === 4 &&
						probe.bodyComplete &&
						probe.historyComplete &&
						probe.subscriptions === 0
					);
				});
				beforeHTML = await page.locator('#automatic-slot').innerHTML();
				if (name === 'retire') {
					await page.evaluate(() =>
						window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })),
					);
					releaseAsset();
					await page.waitForFunction(
						() => document.documentElement.dataset.automaticAborted === 'true',
					);
					assert.equal((await page.evaluate(() => window.__automaticProbe())).subscriptions, 0);
					assert.equal((await page.evaluate(() => window.__automaticProbe())).aborted, true);
					assert.notEqual(
						await page.evaluate(() => document.documentElement.dataset.automaticReady),
						'true',
					);
					assert.deepEqual(errors, []);
					reports.push({ name, requests, abortedBeforeActivation: true, errors });
					continue;
				}
				releaseAsset();
			}
			await page.waitForFunction(() => document.documentElement.dataset.automaticReady === 'true');
			assert.equal(
				await page.evaluate(() => document.documentElement.dataset.automaticMode),
				name === 'bindings' ? 'bindings' : 'renderer',
			);
			if (name !== 'fallback') {
				await page.waitForFunction(async (id) => {
					const trace = await (await fetch(`/trace?run=${id}`)).json();
					return trace.requests.some((request) =>
						request.events.some((event) => event.event === 'auth:held'),
					);
				}, run);
				await page.evaluate(async (id) => {
					const r = await fetch(`/release?run=${id}`, { method: 'POST' });
					if (!r.ok) throw Error(`release: ${r.status}`);
				}, run);
			}
			await page.waitForFunction(() => {
				const s = window.__automatic.snapshot();
				return (
					s.bodyRevision === 4 && s.historyRevision === 4 && s.bodyComplete && s.historyComplete
				);
			});
			await page.locator('#automatic-action').click({ force: true });
			assert.equal(await page.locator('#automatic-interactions').textContent(), 'Interactions: 1');
			assert.equal(await page.locator('#automatic-response').textContent(), 'Response revision: 4');
			assert.equal(await page.locator('#automatic-history').textContent(), 'History revision: 4');
			const snapshot = await page.evaluate(() => window.__automatic.snapshot());
			const dom = await page.locator('#automatic-slot').evaluate((slot) => ({
				text: slot.textContent,
				html: slot.innerHTML,
				nodes: [...slot.childNodes].map((node) => ({
					type: node.nodeType,
					name: node.nodeName,
					value: node.nodeType === 3 || node.nodeType === 8 ? node.nodeValue : null,
				})),
				stamp: document.getElementById('automatic-status')?.getAttribute('data-octane-bindings'),
			}));
			const visible = 'Conversation statusResponse revision: 4History revision: 4Interactions: 1';
			if (dom.text !== visible || dom.nodes.length !== 1 || dom.nodes[0].name !== 'SECTION')
				console.error(name, dom);
			assert.equal(dom.text, visible);
			assert.deepEqual(dom.nodes, [{ type: 1, name: 'SECTION', value: null }]);
			assert.equal(dom.stamp, name === 'mismatch-stamp' ? 'wrong-stamp' : report.stamp);
			const trace = await (await fetch(`${server.url}/trace?run=${run}`)).json();
			const events = trace.requests.flatMap((request) => request.events);
			for (const event of ['auth:start', 'body:start', 'history:start'])
				assert.equal(events.filter((item) => item.event === event).length, 1);
			for (const event of ['body:yield', 'history:yield'])
				assert.deepEqual(
					events.filter((item) => item.event === event).map((item) => item.revision),
					[1, 2, 3, 4],
				);
			assert.equal(snapshot.subscriptions, 1);
			assert.equal(snapshot.clicks, 1);
			if (name === 'fallback') assert.equal(snapshot.draft, 'typed before fallback');
			assert.equal(
				await page.evaluate(() => Number(document.documentElement.dataset.clientLoaderCalls || 0)),
				0,
			);
			assert.deepEqual(errors, []);
			if (name.startsWith('mismatch') && name !== 'mismatch-stamp') {
				assert.ok(
					snapshot.errors.length > 0,
					'ordinary renderer must report recovery of unknown markup',
				);
				assert.ok(
					snapshot.errors.every((error) => error.includes('Octane error #51')),
					JSON.stringify(snapshot.errors),
				);
			} else {
				assert.deepEqual(snapshot.errors, []);
				assert.equal(
					await page.evaluate(
						() => window.__automaticInitialRoot === document.getElementById('automatic-status'),
					),
					true,
				);
			}
			if (name === 'bindings') assert.ok(!requests.some((file) => file.includes('/renderer-')));
			if (name === 'fallback' || name.startsWith('mismatch'))
				assert.ok(requests.some((file) => file.includes('/renderer-')));
			reports.push({
				name,
				requests,
				beforeHTML,
				snapshot,
				dom,
				errors,
				requestedGzip: [...new Set(requests)].reduce(
					(sum, file) => sum + report.outputs[file].gzip,
					0,
				),
			});
		} finally {
			releaseAsset?.();
			await context.close();
			await server.close();
		}
	}
	const result = {
		baseline: {
			build: path.join(baseline.output, 'build.json'),
			initialGzip: baseline.initialGzip,
			eventualGzip: baseline.eventualGzip,
		},
		candidate: {
			build: path.join(candidate.output, 'build.json'),
			initialGzip: candidate.initialGzip,
			eventualGzip: candidate.eventualGzip,
		},
		browser: browser.version(),
		reports,
		driver: { path: import.meta.filename, sha256: hash(import.meta.filename) },
	};
	const out = path.join(candidate.output, 'browser.json');
	fs.writeFileSync(out, JSON.stringify(result, null, 2));
	console.log(JSON.stringify({ artifact: out, ...result }, null, 2));
} finally {
	await browser.close();
}
