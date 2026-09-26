import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { digest, toolchain, tree } from '../signal-chat-route/evidence.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const directory = path.resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Pass the build output directory');
const outputPath = path.resolve(
	process.argv[3] ?? path.join(directory, 'binding-browser-report.json'),
);
assert.ok(process.env.PLAYWRIGHT_EXECUTABLE_PATH, 'Set an authorized Chromium executable');
const reportBytes = fs.readFileSync(path.join(directory, 'build-report.json'));
const report = JSON.parse(reportBytes);
assert.deepEqual(tree(path.join(repo, 'examples/signal-chat')), report.source);
assert.deepEqual(tree(path.join(directory, 'project')), report.projectSource);
assert.deepEqual(toolchain(repo), report.toolchain);
assert.deepEqual(tree(path.join(directory, 'project/dist'), new Set()), report.artifactFiles);
for (const [file, hash] of Object.entries(report.candidateInputs))
	assert.equal(digest(fs.readFileSync(path.join(import.meta.dirname, file))), hash, file);
const driverHash = digest(fs.readFileSync(import.meta.filename));
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { chromium } = require('playwright');
const server = fork(
	path.join(repo, 'benchmarks/streamed-shell-prototype/signal-chat-route/server.mjs'),
	[path.join(directory, 'project')],
	{ stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
);
let serverLog = '';
server.stdout.on('data', (chunk) => {
	serverLog += chunk;
});
server.stderr.on('data', (chunk) => {
	serverLog += chunk;
});
const requests = [];
const trace503Messages = [];
server.on('message', (message) => {
	if (message.request) requests.push(message.request);
});
const [listening] = await Promise.race([
	once(server, 'message'),
	once(server, 'exit').then(([code]) => {
		throw new Error(`Server exited ${code}: ${serverLog}`);
	}),
]);
const origin = `http://127.0.0.1:${listening.port}`;
const browser = await chromium.launch({
	executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
	headless: true,
});
const results = [];
const output = {
	buildSha256: digest(reportBytes),
	driverHash,
	browser: browser.version(),
	results,
	error: null,
};

function url(run, params = {}) {
	const value = new URL('/', origin);
	for (const [key, item] of Object.entries({
		run,
		auth: '1500',
		answer: '50',
		history: '70',
		interval: '30',
		waves: '2',
		turns: '3',
		historyRows: '2',
		...params,
	}))
		value.searchParams.set(key, item);
	return value.href;
}
async function trace(run) {
	const response = await fetch(`${origin}/__lab/trace?run=${encodeURIComponent(run)}`);
	assert.equal(response.status, 200);
	return (await response.json()).events;
}
async function waitTrace(run, predicate) {
	for (let attempt = 0; attempt < 200; attempt++) {
		const events = await trace(run);
		if (predicate(events)) return events;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(`Timed out waiting for trace events for ${run}`);
}
function diagnostics(page) {
	const errors = [];
	const canceled = [];
	page.on('pageerror', (error) => errors.push(`pageerror: ${error}`));
	page.on('console', (message) => {
		if (!['warning', 'error'].includes(message.type())) return;
		const resource = message.location().url;
		if (resource?.endsWith('/favicon.ico') && message.text().includes('404')) return;
		if (resource?.includes('/__lab/trace') && message.text().includes('503')) {
			trace503Messages.push({ url: resource, text: message.text() });
			return;
		}
		errors.push(`${message.type()}: ${message.text()}`);
	});
	page.on('requestfailed', (request) => {
		const failure = `${request.url()} ${request.failure()?.errorText}`;
		if (
			request.failure()?.errorText === 'net::ERR_ABORTED' &&
			new URL(request.url()).pathname.startsWith('/_$_ripple_rpc_$_/')
		)
			canceled.push(failure);
		else errors.push(`requestfailed: ${failure}`);
	});
	return { errors, canceled };
}
async function init(page) {
	await page.addInitScript(() => {
		const state = { starts: 0, stops: 0, ticks: 0, active: 0, clicks: [] };
		const timers = new Set();
		const start = window.setInterval;
		const stop = window.clearInterval;
		window.setInterval = function (fn, delay, ...args) {
			if (delay !== 400 || typeof fn !== 'function') return start(fn, delay, ...args);
			state.starts++;
			state.active++;
			const id = start(() => {
				state.ticks++;
				fn(...args);
			}, delay);
			timers.add(id);
			return id;
		};
		window.clearInterval = function (id) {
			if (timers.delete(id)) {
				state.stops++;
				state.active--;
			}
			return stop(id);
		};
		document.addEventListener(
			'click',
			(event) => {
				if (!(event.target instanceof Element) || !event.target.closest('.capture-actions')) return;
				queueMicrotask(() =>
					state.clicks.push({
						trusted: event.isTrusted,
						prevented: event.defaultPrevented,
						connected: event.target.isConnected,
					}),
				);
			},
			true,
		);
		globalThis.__metricsClock = state;
	});
}
async function network(page) {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Network.enable');
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	const pending = new Map();
	const complete = [];
	cdp.on('Network.responseReceived', ({ requestId, response }) => {
		const pathname = new URL(response.url).pathname;
		if (pathname.endsWith('.js')) {
			const encoding =
				Object.entries(response.headers).find(
					([name]) => name.toLowerCase() === 'content-encoding',
				)?.[1] ?? 'identity';
			pending.set(requestId, {
				path: pathname,
				status: response.status,
				contentEncoding: encoding,
			});
		}
	});
	cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
		const item = pending.get(requestId);
		if (item) {
			complete.push({ ...item, encodedDataLength });
			pending.delete(requestId);
		}
	});
	return () => [...complete].sort((a, b) => a.path.localeCompare(b.path));
}
async function newPage() {
	const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
	const page = await context.newPage();
	const { errors, canceled } = diagnostics(page);
	await init(page);
	const js = await network(page);
	return { context, page, errors, canceled, js };
}
async function resourceJs(page) {
	return page.evaluate(() =>
		performance
			.getEntriesByType('resource')
			.filter((entry) => new URL(entry.name).pathname.endsWith('.js'))
			.map((entry) => ({
				path: new URL(entry.name).pathname,
				encodedBodySize: entry.encodedBodySize,
				decodedBodySize: entry.decodedBodySize,
				transferSize: entry.transferSize,
			}))
			.sort((a, b) => a.path.localeCompare(b.path)),
	);
}
async function waitChoice(page, expected) {
	await page.waitForFunction(
		(choice) => globalThis.__octaneIslandsFirstCheckpoint?.metricsChoice === choice,
		expected,
	);
}

async function paired(mode) {
	const { context, page, errors, canceled, js } = await newPage();
	const run = `binding-${mode}`;
	try {
		await page.goto(
			url(run, { answer: '900', ...(mode === 'binding' ? { __bindingMetrics: '1' } : {}) }),
			{
				waitUntil: 'commit',
			},
		);
		await page.getByText('Waiting for the request configuration…', { exact: true }).waitFor();
		await page.waitForFunction(() => globalThis.__metricsClock.starts === 1);
		assert.equal(
			(await trace(run)).filter((e) => e.channel === 'session' && e.type === 'complete').length,
			0,
		);
		await waitChoice(page, mode === 'binding' ? 'binding' : 'ordinary');
		if (mode === 'binding')
			await page.waitForFunction(
				() => globalThis.__metricsCandidate?.status().actionsAdoptions === 1,
			);
		await page.getByRole('button', { name: 'Export browser trace' }).waitFor();
		await page.waitForLoadState('load');
		await page.waitForFunction(() => globalThis.__metricsClock.ticks >= 2);
		const startup = js();
		const startupBodies = await resourceJs(page);
		assert.ok(startup.length > 0);
		assert.ok(
			startup.every(
				(item) =>
					item.status === 200 &&
					typeof item.contentEncoding === 'string' &&
					item.contentEncoding.length > 0,
			),
		);
		const checkpoint = await page.evaluate(() => globalThis.__octaneIslandsFirstCheckpoint);
		assert.equal(checkpoint.registryStarts, 1);
		assert.equal(checkpoint.hasSignalOwner, true);
		assert.equal(checkpoint.hasStreamReceiver, true);
		if (mode === 'binding') {
			assert.equal(checkpoint.metricsActivated, 'binding');
			assert.ok(!startup.some((item) => item.path.endsWith('/' + checkpoint.metricsModuleId)));
			assert.ok(!startup.some((item) => /\/runtime-[^/]+\.js$/.test(item.path)));
		}
		await page.evaluate(() => {
			const frame = document.querySelector('section.metrics');
			const details = frame.querySelector('details');
			details.open = true;
			const button = frame.querySelector('button');
			button.focus();
			globalThis.__metricNodes = { frame, details, button, row: frame.querySelector('li') };
		});
		const ticks = await page.evaluate(() => globalThis.__metricsClock.ticks);
		await page.waitForFunction((n) => globalThis.__metricsClock.ticks > n, ticks);
		assert.deepEqual(
			await page.evaluate(() => ({
				frame: __metricNodes.frame === document.querySelector('section.metrics'),
				details:
					__metricNodes.details === document.querySelector('section.metrics details') &&
					__metricNodes.details.open,
				row: __metricNodes.row === document.querySelector('section.metrics li'),
				focused: document.activeElement === __metricNodes.button,
			})),
			{ frame: true, details: true, row: true, focused: true },
		);
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Export browser trace' }).click(),
		]);
		assert.equal(download.suggestedFilename(), `signal-chat-${run}.json`);
		const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
		assert.equal(exported.server.run, run);
		assert.ok(
			exported.browser.observations.some(
				(entry) => entry.event === 'activated' && entry.region === 'metrics',
			),
		);
		await page.locator('.capture-actions output').getByText('Exported', { exact: true }).waitFor();
		const [popup] = await Promise.all([
			page.waitForEvent('popup'),
			page.getByRole('link', { name: 'Producer trace' }).click(),
		]);
		await popup.waitForLoadState('domcontentloaded');
		assert.equal(new URL(popup.url()).searchParams.get('run'), run);
		await popup.close();
		await page.route('**/__lab/trace?*', (route) =>
			route.fulfill({ status: 503, body: 'unavailable' }),
		);
		await page.getByRole('button', { name: 'Export browser trace' }).click();
		await page
			.locator('.capture-actions output')
			.getByText('Error: Producer trace returned 503', { exact: true })
			.waitFor();
		await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Activate the composer');
		await page.waitForFunction(
			() =>
				document.querySelector('[data-composer-ready]')?.getAttribute('data-composer-ready') ===
				'true',
		);
		await page.getByRole('button', { name: 'Send message' }).click();
		await page.waitForFunction(() => document.querySelector('#message')?.value === '');
		const answerBeforeCleanup = await waitTrace(run, (events) =>
			events.some(
				(event) =>
					event.channel === 'answer' && event.transport === 'rpc' && event.type === 'start',
			),
		);
		assert.equal(
			answerBeforeCleanup.filter(
				(event) =>
					event.channel === 'answer' && event.transport === 'rpc' && event.type === 'start',
			).length,
			1,
		);
		assert.equal(
			answerBeforeCleanup.filter(
				(event) =>
					event.channel === 'answer' && event.transport === 'rpc' && event.type === 'complete',
			).length,
			0,
		);
		const afterInteraction = js();
		const afterInteractionBodies = await resourceJs(page);
		const events = await trace(run);
		assert.equal(
			events.filter(
				(event) =>
					event.channel === 'session' && event.transport === 'document' && event.type === 'start',
			).length,
			1,
		);
		assert.equal(
			events.filter(
				(event) =>
					event.channel === 'session' && event.transport === 'rpc' && event.type === 'start',
			).length,
			0,
		);
		const beforeCleanup = await page.evaluate(() => ({
			clock: __metricsClock,
			candidate: globalThis.__metricsCandidate?.status(),
		}));
		assert.deepEqual(canceled, []);
		await page.evaluate(() =>
			window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })),
		);
		await page.waitForFunction(() => globalThis.__metricsClock.active === 0);
		const answerAfterCleanup = await waitTrace(run, (events) =>
			events.some(
				(event) =>
					event.channel === 'answer' && event.transport === 'rpc' && event.type === 'finally',
			),
		);
		const answerOutcome = answerAfterCleanup.filter(
			(event) => event.channel === 'answer' && event.transport === 'rpc',
		);
		assert.equal(answerOutcome.filter((event) => event.type === 'abort').length, 1);
		assert.equal(answerOutcome.filter((event) => event.type === 'finally').length, 1);
		assert.equal(answerOutcome.filter((event) => event.type === 'complete').length, 0);
		assert.deepEqual(
			answerOutcome.map((event) => event.type),
			['start', 'abort', 'finally'],
		);
		for (let attempt = 0; attempt < 100 && canceled.length === 0; attempt++)
			await page.waitForTimeout(10);
		assert.equal(canceled.length, 1);
		assert.equal(canceled[0], `${origin}/_$_ripple_rpc_$_/8b3cc558 net::ERR_ABORTED`);
		const afterCleanup = await page.evaluate(() => ({
			clock: __metricsClock,
			candidate: globalThis.__metricsCandidate?.status(),
		}));
		assert.deepEqual(errors, []);
		return {
			mode,
			checkpoint,
			startupJs: startup,
			startupTransferBytes: startup.reduce((sum, item) => sum + item.encodedDataLength, 0),
			startupBodies,
			startupEncodedBodyBytes: startupBodies.reduce((sum, item) => sum + item.encodedBodySize, 0),
			afterInteractionJs: afterInteraction,
			afterInteractionTransferBytes: afterInteraction.reduce(
				(sum, item) => sum + item.encodedDataLength,
				0,
			),
			afterInteractionBodies,
			afterInteractionEncodedBodyBytes: afterInteractionBodies.reduce(
				(sum, item) => sum + item.encodedBodySize,
				0,
			),
			beforeCleanup,
			afterCleanup,
			download: download.suggestedFilename(),
			failure: 'Error: Producer trace returned 503',
			canceledOnPagehide: canceled,
			answerOutcome,
		};
	} finally {
		await context.close();
	}
}

async function held(kind) {
	const { context, page, errors, canceled } = await newPage();
	const run = `held-${kind}`;
	const exportRequests = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/__lab/trace') exportRequests.push(request.url());
	});
	try {
		await page.goto(url(run, { auth: '40', __bindingMetrics: '1', __metricsActionsHold: '1' }), {
			waitUntil: 'commit',
		});
		await page.waitForFunction(
			() => globalThis.__octaneIslandsFirstCheckpoint?.metricsActivated === 'binding',
		);
		const button = page.getByRole('button', { name: 'Export browser trace' });
		await button.waitFor();
		await page.waitForFunction(() => typeof globalThis.__metricsActionsRelease === 'function');
		await button.click();
		if (kind === 'replaced')
			await button.evaluate((element) => element.replaceWith(element.cloneNode(true)));
		if (kind === 'detached')
			await button.evaluate((element) =>
				element.closest('[data-octane-hydrate-independent]').remove(),
			);
		if (kind === 'malformed')
			await page.locator('.capture-actions output').evaluate((element) => element.remove());
		await page.evaluate(() => globalThis.__metricsActionsRelease());
		if (kind === 'retained')
			await page
				.locator('.capture-actions output')
				.getByText('Exported', { exact: true })
				.waitFor();
		else await page.waitForTimeout(700);
		const state = await page.evaluate(() => ({
			clock: __metricsClock,
			candidate: globalThis.__metricsCandidate?.status(),
			output: document.querySelector('.capture-actions output')?.textContent ?? null,
		}));
		assert.equal(state.clock.clicks.length, 1);
		assert.equal(state.clock.clicks[0].trusted, true);
		if (kind !== 'retained') assert.notEqual(state.output, 'Exported');
		assert.equal(exportRequests.length, kind === 'retained' ? 1 : 0);
		if (kind === 'detached') assert.equal(state.candidate.disposed, true);
		if (kind === 'malformed') {
			assert.equal(state.candidate.disposed, true);
			assert.ok(state.candidate.failure);
		}
		await page.waitForLoadState('load');
		assert.deepEqual(errors, []);
		assert.deepEqual(canceled, []);
		return { kind, state, exportRequests };
	} finally {
		await context.close();
	}
}

async function selector(kind) {
	const { context, page, errors, canceled } = await newPage();
	const run = `selector-${kind}`;
	try {
		const params = {
			auth: '40',
			__bindingMetrics: '1',
			__metricsSelect: kind === 'malformed' ? 'hold' : kind,
		};
		await page.goto(url(run, params), { waitUntil: 'commit' });
		if (kind === 'malformed') {
			await page.waitForFunction(() => typeof globalThis.__metricsSelectionRelease === 'function');
			await page
				.locator('dl.timings > div')
				.first()
				.evaluate((element) => element.remove());
			await page.evaluate(() => globalThis.__metricsSelectionRelease());
		}
		await waitChoice(page, 'ordinary');
		await page.getByRole('button', { name: 'Export browser trace' }).waitFor();
		const checkpoint = await page.evaluate(() => globalThis.__octaneIslandsFirstCheckpoint);
		assert.equal(checkpoint.metricsActivated, undefined);
		await page.waitForLoadState('load');
		assert.deepEqual(errors, []);
		assert.deepEqual(canceled, []);
		return { kind, checkpoint, diagnostics: errors };
	} finally {
		await context.close();
	}
}

// The real Metrics boundary is load-triggered. The optional marker mutation
// is a separate synthetic control for the registry's interaction intent path.
async function beforeActivation(mode, kind) {
	const { context, page, errors, canceled } = await newPage();
	const run = `preactivation-${mode}-${kind}`;
	const exportRequests = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/__lab/trace') exportRequests.push(request.url());
	});
	let releaseOrdinary = () => {};
	let moduleHeld = Promise.resolve();
	if (mode === 'ordinary') {
		let arrived;
		moduleHeld = new Promise((resolve) => {
			arrived = resolve;
		});
		const gate = new Promise((resolve) => {
			releaseOrdinary = resolve;
		});
		await page.route(`**/${report.metricsEmittedFile}`, async (route) => {
			arrived();
			await gate;
			await route.continue();
		});
	}
	try {
		const params = mode === 'binding' ? { __bindingMetrics: '1', __metricsSelect: 'hold' } : {};
		await page.goto(url(run, { auth: '40', ...params }), { waitUntil: 'commit' });
		if (mode === 'binding')
			await page.waitForFunction(() => typeof globalThis.__metricsSelectionRelease === 'function');
		else await moduleHeld;
		const button = page.getByRole('button', { name: 'Export browser trace' });
		await button.waitFor();
		await button.evaluate((element) => {
			globalThis.__preActivationButton = element;
		});
		if (kind !== 'load') await button.focus();
		if (kind !== 'load')
			await button.evaluate((element) =>
				element
					.closest('[data-octane-hydrate-independent]')
					.setAttribute('data-octane-hydrate-when', 'interaction'),
			);
		if (kind === 'load') await button.click();
		else await page.keyboard.press('Enter');
		if (kind === 'two') await page.keyboard.press('Enter');
		if (kind === 'replaced')
			await button.evaluate((element) => element.replaceWith(element.cloneNode(true)));
		if (kind !== 'load')
			await page
				.locator('section.metrics')
				.evaluate((element) =>
					element
						.closest('[data-octane-hydrate-independent]')
						.setAttribute('data-octane-hydrate-when', 'load'),
				);
		if (mode === 'binding') await page.evaluate(() => globalThis.__metricsSelectionRelease());
		else releaseOrdinary();
		await waitChoice(page, mode === 'binding' ? 'binding' : 'ordinary');
		if (mode === 'binding') {
			await page.waitForFunction(
				() =>
					globalThis.__metricsCandidate?.status().actionsAdoptions === 1 ||
					globalThis.__octaneIslandsFirstCheckpoint?.metricsActivated ===
						'ordinary-after-selection',
			);
			const actual = await page.evaluate(
				() => globalThis.__octaneIslandsFirstCheckpoint.metricsActivated,
			);
			assert.equal(actual, 'binding', `Unexpected post-selection fallback in ${kind}`);
		} else await page.waitForFunction(() => globalThis.__metricsClock.starts === 1);
		await page.waitForTimeout(500);
		const beforeLive = await page.evaluate(() => ({
			clock: __metricsClock,
			candidate: globalThis.__metricsCandidate?.status(),
			output: document.querySelector('.capture-actions output')?.textContent,
			originalTargetRetained:
				__preActivationButton === document.querySelector('.capture-actions button') &&
				__preActivationButton.isConnected,
		}));
		const replayRequests = exportRequests.length;
		output.inFlight = {
			case: 'preactivation',
			mode,
			kind,
			beforeLive,
			replayRequests,
			diagnostics: errors,
		};
		if (kind === 'load' || kind === 'replaced') assert.equal(replayRequests, 0);
		if (kind === 'retained') assert.equal(replayRequests, mode === 'binding' ? 1 : 0);
		if (kind === 'two') assert.equal(replayRequests, 2);
		assert.equal(beforeLive.clock.clicks.length, kind === 'two' ? 2 : 1);
		assert.ok(beforeLive.clock.clicks.every((click) => click.trusted));
		await button.click();
		await page.waitForFunction(
			(count) =>
				performance
					.getEntriesByType('resource')
					.filter((entry) => new URL(entry.name).pathname === '/__lab/trace').length > count,
			replayRequests,
		);
		await page.waitForLoadState('load');
		assert.deepEqual(errors, []);
		assert.deepEqual(canceled, []);
		delete output.inFlight;
		return {
			case: 'preactivation',
			mode,
			kind,
			markerMutation:
				kind === 'load'
					? null
					: 'load -> interaction during trusted clicks -> load before releasing loader',
			beforeLive,
			replayRequests,
			totalExportRequests: exportRequests.length,
		};
	} finally {
		releaseOrdinary();
		await context.close();
	}
}

async function resetNegative() {
	const { context, page, errors, canceled } = await newPage();
	try {
		await page.goto(url('reset-negative', { auth: '40', __bindingMetrics: '1' }), {
			waitUntil: 'commit',
		});
		await page.waitForFunction(
			() => globalThis.__metricsCandidate?.status().actionsAdoptions === 1,
		);
		await page.evaluate(() => globalThis.__metricsCandidate.resetForNegativeControl());
		await page.waitForFunction(() => globalThis.__metricsCandidate?.status().lateStatus !== null);
		const state = await page.evaluate(() => ({
			candidate: __metricsCandidate.status(),
			text: document.querySelector('.capture-actions')?.textContent ?? null,
		}));
		assert.equal(state.candidate.lateStatus, 'pending');
		assert.ok(state.text?.includes('reset-negative'));
		await page.waitForLoadState('load');
		assert.deepEqual(errors, []);
		assert.deepEqual(canceled, []);
		return { state, diagnostics: errors };
	} finally {
		await context.close();
	}
}

async function rejection(mode) {
	const { context, page, errors, canceled } = await newPage();
	try {
		const params = { auth: 'bad', ...(mode === 'binding' ? { __bindingMetrics: '1' } : {}) };
		await page.goto(url(`reject-${mode}`, params), { waitUntil: 'commit' });
		await page.getByText('Capture configuration failed.', { exact: true }).waitFor();
		await page.waitForFunction(() => globalThis.__metricsClock.starts === 1);
		const state = await page.evaluate(() => ({
			checkpoint: __octaneIslandsFirstCheckpoint,
			clock: __metricsClock,
			candidate: globalThis.__metricsCandidate?.status(),
			text: document.querySelector('section.metrics')?.textContent,
		}));
		if (mode === 'binding') {
			assert.equal(state.checkpoint.metricsActivated, 'binding');
			assert.equal(state.candidate.status, 'error');
		}
		await page.waitForLoadState('load');
		assert.deepEqual(errors, []);
		assert.deepEqual(canceled, []);
		return { mode, rejection: state };
	} finally {
		await context.close();
	}
}

// Terminate the actual upstream document stream after the Metrics pending
// range and its sidecar have been delivered. The browser sees EOF without a
// terminal result frame. This deliberately tests transport loss, not $OCTRX.
async function abortNegative() {
	let severed = false;
	let documentBytes = 0;
	const proxy = http.createServer((incoming, outgoing) => {
		const upstream = http.request(
			new URL(incoming.url, origin),
			{ method: incoming.method, headers: incoming.headers },
			(response) => {
				outgoing.writeHead(response.statusCode, response.headers);
				const document = new URL(incoming.url, origin).pathname === '/';
				let observed = '';
				response.on('data', (chunk) => {
					if (outgoing.destroyed) return;
					outgoing.write(chunk);
					if (!document || severed) return;
					observed += chunk.toString('utf8');
					documentBytes += chunk.length;
					const bootstrap = observed.indexOf('data-octane-hydrate-src=');
					if (
						observed.includes('Waiting for the request configuration') &&
						observed.includes('"hookSeed":3456549929') &&
						bootstrap !== -1 &&
						observed.indexOf('</script>', bootstrap) !== -1
					) {
						severed = true;
						upstream.destroy();
						outgoing.end();
					}
				});
				response.on('end', () => {
					if (!outgoing.writableEnded) outgoing.end();
				});
				response.on('error', () => {
					if (!outgoing.writableEnded) outgoing.end();
				});
			},
		);
		upstream.on('error', (error) => {
			if (!outgoing.headersSent) outgoing.writeHead(502);
			if (!outgoing.writableEnded) outgoing.end(String(error));
		});
		incoming.pipe(upstream);
	});
	proxy.listen(0, '127.0.0.1');
	await once(proxy, 'listening');
	const { context, page, errors, canceled } = await newPage();
	try {
		const broken = new URL(url('transport-abort', { auth: '2000', __bindingMetrics: '1' }));
		broken.port = String(proxy.address().port);
		await page.goto(broken.href, { waitUntil: 'commit' });
		await page.waitForFunction(
			() => globalThis.__octaneIslandsFirstCheckpoint?.metricsActivated === 'binding',
		);
		assert.equal(severed, true);
		await page.getByText('Waiting for the request configuration…', { exact: true }).waitFor();
		await page.waitForFunction(
			() => globalThis.__metricsCandidate?.status().status === 'error',
			null,
			{ timeout: 40000 },
		);
		const state = await page.evaluate(() => ({
			candidate: __metricsCandidate.status(),
			text: document.querySelector('section.metrics')?.textContent,
			clock: __metricsClock,
		}));
		assert.ok(state.text.includes('Waiting for the request configuration'));
		assert.equal(state.candidate.status, 'error');
		assert.deepEqual(errors, []);
		assert.deepEqual(canceled, []);
		return { case: 'transport-abort-timeout', severed, documentBytes, state };
	} catch (error) {
		output.inFlight = {
			case: 'transport-abort-timeout',
			severed,
			documentBytes,
			state: await page.evaluate(() => ({
				checkpoint: globalThis.__octaneIslandsFirstCheckpoint,
				candidate: globalThis.__metricsCandidate?.status(),
				html: document.documentElement?.outerHTML.slice(-3000),
				ready: document.readyState,
			})),
			diagnostics: errors,
		};
		throw error;
	} finally {
		await context.close();
		await new Promise((resolve) => proxy.close(resolve));
	}
}

const expectedDisconnectBlock = [
	'[octane] SSR render error: Error: The client disconnected before the request completed.',
	`    at IncomingMessage.abortRequest (file://${repo}/packages/app-core/src/server/node-http.js:192:25)`,
	'    at Object.onceWrapper (node:events:630:28)',
	'    at IncomingMessage.emit (node:events:509:20)',
	'    at IncomingMessage._destroy (node:_http_incoming:244:10)',
	'    at _destroy (node:internal/streams/destroy:122:10)',
	'    at IncomingMessage.destroy (node:internal/streams/destroy:84:5)',
	'    at abortIncoming (node:_http_server:912:9)',
	'    at socketOnClose (node:_http_server:905:3)',
	'    at Socket.emit (node:events:521:24)',
	'    at TCP.<anonymous> (node:net:355:12)',
	'',
].join('\n');

async function runCase(fn, expectedDisconnects = 0, expectedTraceRun) {
	const start = serverLog.length;
	const traceStart = trace503Messages.length;
	const value = await fn();
	await new Promise((resolve) => setTimeout(resolve, 100));
	value.serverDiagnostics = serverLog.slice(start);
	value.trace503Diagnostics = trace503Messages.slice(traceStart);
	assert.equal(
		value.serverDiagnostics,
		expectedDisconnectBlock.repeat(expectedDisconnects),
		'Unexpected server diagnostic for this case',
	);
	assert.equal(value.trace503Diagnostics.length, expectedTraceRun ? 1 : 0);
	if (expectedTraceRun) {
		const diagnostic = value.trace503Diagnostics[0];
		assert.equal(new URL(diagnostic.url).origin, origin);
		assert.equal(new URL(diagnostic.url).pathname, '/__lab/trace');
		assert.equal(new URL(diagnostic.url).searchParams.get('run'), expectedTraceRun);
		assert.equal(
			diagnostic.text,
			'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
		);
	}
	return value;
}

try {
	for (const mode of ['ordinary', 'binding'])
		results.push(await runCase(() => paired(mode), 0, `binding-${mode}`));
	for (const kind of ['retained', 'replaced', 'detached', 'malformed'])
		results.push(await runCase(() => held(kind)));
	for (const kind of ['false', 'throw', 'malformed'])
		results.push(await runCase(() => selector(kind)));
	for (const mode of ['ordinary', 'binding']) results.push(await runCase(() => rejection(mode)));
	for (const mode of ['ordinary', 'binding']) {
		for (const kind of ['load', 'retained', 'replaced'])
			results.push(await runCase(() => beforeActivation(mode, kind)));
	}
	results.push(await runCase(() => beforeActivation('binding', 'two')));
	results.push(await runCase(() => resetNegative()));
	results.push(await runCase(() => abortNegative(), 4));
	assert.equal(serverLog, expectedDisconnectBlock.repeat(4));
	assert.deepEqual(tree(path.join(repo, 'examples/signal-chat')), report.source);
	assert.deepEqual(tree(path.join(directory, 'project')), report.projectSource);
	assert.deepEqual(toolchain(repo), report.toolchain);
	assert.deepEqual(tree(path.join(directory, 'project/dist'), new Set()), report.artifactFiles);
	for (const [file, hash] of Object.entries(report.candidateInputs))
		assert.equal(digest(fs.readFileSync(path.join(import.meta.dirname, file))), hash, file);
	assert.equal(
		digest(fs.readFileSync(import.meta.filename)),
		driverHash,
		'Browser driver changed during the run',
	);
} catch (error) {
	output.error = String(error?.stack ?? error);
	throw error;
} finally {
	output.serverLog = serverLog;
	output.serverRequests = requests;
	fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
	await browser.close();
	if (server.exitCode === null && server.signalCode === null) {
		const ended = once(server, 'exit');
		server.kill();
		await ended;
	}
}
console.log(JSON.stringify({ file: outputPath, cases: results.length }, null, 2));
