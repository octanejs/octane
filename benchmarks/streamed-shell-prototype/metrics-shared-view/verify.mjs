import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { digest, toolchain, tree } from '../signal-chat-route/evidence.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const output = path.resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Pass the output directory from build.mjs');
assert.ok(process.env.PLAYWRIGHT_EXECUTABLE_PATH, 'Set the authorized Chromium executable');
const reportPath = path.join(output, 'build-report.json');
const reportBytes = fs.readFileSync(reportPath);
const build = JSON.parse(reportBytes);
assert.deepEqual(tree(here), build.inputs, 'Benchmark inputs changed after building');
assert.deepEqual(toolchain(repo), build.toolchain, 'Selected toolchain changed after building');
assert.deepEqual(
	tree(path.join(repo, 'examples/signal-chat')),
	build.source,
	'Example source changed',
);
assert.deepEqual(tree(path.join(output, 'source')), build.source, 'Source snapshot changed');
for (const [mode, project] of Object.entries(build.projects)) {
	const directory = path.join(output, mode);
	assert.deepEqual(tree(path.join(directory, 'project')), project.source, `${mode} source changed`);
	assert.deepEqual(
		tree(path.join(directory, 'project/dist'), new Set()),
		project.artifacts,
		`${mode} artifacts changed`,
	);
	assert.equal(
		digest(fs.readFileSync(path.join(directory, 'client-manifest.json'))),
		project.manifestSha256,
	);
	assert.equal(digest(fs.readFileSync(path.join(directory, 'build.json'))), project.buildSha256);
}
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({
	executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
	headless: true,
});
const result = { buildSha256: digest(reportBytes), cases: [], error: null };
const servers = [];
function href(origin, params) {
	const url = new URL('/', origin);
	for (const [key, value] of Object.entries({
		answer: '50',
		history: '70',
		interval: '30',
		waves: '2',
		turns: '3',
		historyRows: '2',
		...params,
	}))
		url.searchParams.set(key, value);
	return url.href;
}
async function startServer(mode) {
	const child = fork(
		path.join(repo, 'benchmarks/streamed-shell-prototype/signal-chat-route/server.mjs'),
		[path.join(output, mode, 'project')],
		{ stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
	);
	let logs = '';
	child.stdout.on('data', (chunk) => {
		logs += chunk;
	});
	child.stderr.on('data', (chunk) => {
		logs += chunk;
	});
	const [message] = await Promise.race([
		once(child, 'message'),
		once(child, 'exit').then(([code]) => {
			throw new Error(`${mode} server exited ${code}: ${logs}`);
		}),
	]);
	const requests = [];
	child.on('message', (event) => {
		if (event.request) requests.push(event.request);
	});
	const server = { child, origin: `http://127.0.0.1:${message.port}`, logs: () => logs, requests };
	servers.push(server);
	return server;
}
async function trace(origin, run) {
	const response = await fetch(`${origin}/__lab/trace?run=${encodeURIComponent(run)}`);
	assert.equal(response.status, 200);
	const value = await response.json();
	assert.equal(value.run, run);
	return value.events;
}
async function waitTrace(origin, run, predicate) {
	for (let i = 0; i < 200; i++) {
		const events = await trace(origin, run);
		if (predicate(events)) return events;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(`Trace timed out for ${run}`);
}
function sessionCounts(events) {
	return Object.fromEntries(
		['start', 'complete', 'abort', 'finally'].map((type) => [
			type,
			events.filter(
				(event) =>
					event.channel === 'session' && event.type === type && event.transport === 'document',
			).length,
		]),
	);
}
async function streamCase(server, mode, kind) {
	const run = `stream-${kind}`;
	const controller = new AbortController();
	const response = await fetch(
		href(server.origin, { run, auth: kind === 'reject' ? 'bad' : '1500' }),
		{ signal: controller.signal },
	);
	assert.equal(response.status, 200);
	const reader = response.body.getReader();
	const parts = [];
	const decoder = new TextDecoder();
	let html = '';
	let pendingBeforeTerminal = false;
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		parts.push(Buffer.from(value));
		html += decoder.decode(value, { stream: true });
		if (html.includes('Waiting for the request configuration') && !pendingBeforeTerminal) {
			pendingBeforeTerminal =
				!html.includes('Export browser trace') && !html.includes('Capture configuration failed.');
			if (kind === 'abort') {
				controller.abort();
				break;
			}
		}
	}
	assert.equal(
		pendingBeforeTerminal,
		true,
		`${mode}/${kind}: pending must precede terminal content`,
	);
	const beforePending = html.slice(0, html.indexOf('Waiting for the request configuration'));
	const sentinel = [
		...beforePending.matchAll(/<template data-oct-b="([^"]+)"\s*><\/template>/g),
	].at(-1)?.[1];
	assert.ok(sentinel, `${mode}/${kind} must retain the server's try sentinel`);
	const bindingOpaque = /b;d:[^;]+;\d+;o/.test(beforePending.slice(-350));
	assert.equal(bindingOpaque, mode === 'shared', `${mode} opaque binding marker`);
	if (kind === 'success') {
		assert.ok(html.includes('Export browser trace'));
		assert.ok(html.includes('$OCTRC'));
		const events = await waitTrace(
			server.origin,
			run,
			(items) => sessionCounts(items).finally === 1,
		);
		assert.deepEqual(sessionCounts(events), { start: 1, complete: 1, abort: 0, finally: 1 });
		assert.equal(
			events.filter(
				(event) =>
					event.channel === 'session' && event.transport === 'rpc' && event.type === 'start',
			).length,
			0,
		);
	} else if (kind === 'reject') {
		assert.ok(html.includes('Capture configuration failed.'));
		assert.ok(html.includes('$OCTRC'));
	} else {
		const events = await waitTrace(
			server.origin,
			run,
			(items) => sessionCounts(items).finally === 1,
		);
		assert.deepEqual(sessionCounts(events), { start: 1, complete: 0, abort: 1, finally: 1 });
	}
	const bytes = Buffer.concat(parts);
	const file = `${mode}-stream-${kind}.html`;
	fs.writeFileSync(path.join(output, file), bytes);
	result.cases.push({
		mode,
		case: `stream-${kind}`,
		pendingBeforeTerminal,
		sentinel,
		bindingOpaque,
		placements: (html.match(/\$OCTRC\(/g) ?? []).length,
		signalFrames: (html.match(/__octaneStreamedRenderer\.receive\(/g) ?? []).length,
		file,
		bytes: bytes.length,
		sha256: digest(bytes),
	});
}
function monitor(page) {
	const errors = [];
	page.on('pageerror', (error) => errors.push(`pageerror: ${error}`));
	page.on('console', (message) => {
		if (!['warning', 'error'].includes(message.type())) return;
		const url = message.location().url;
		const pathname = url ? new URL(url).pathname : '';
		if (pathname === '/favicon.ico' && message.text().includes('404')) return;
		if (pathname === '/__lab/trace' && message.text().includes('503')) return;
		errors.push(`${message.type()}: ${message.text()} ${url}`);
	});
	page.on('requestfailed', (request) =>
		errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`),
	);
	return errors;
}
async function initClock(page) {
	await page.addInitScript(() => {
		const state = { starts: 0, stops: 0, ticks: 0, active: 0 };
		const ids = new Set();
		const set = window.setInterval;
		const clear = window.clearInterval;
		window.setInterval = function (fn, delay, ...args) {
			if (delay !== 400 || typeof fn !== 'function') return set(fn, delay, ...args);
			state.starts++;
			state.active++;
			const id = set(() => {
				state.ticks++;
				fn(...args);
			}, delay);
			ids.add(id);
			return id;
		};
		window.clearInterval = function (id) {
			if (ids.delete(id)) {
				state.stops++;
				state.active--;
			}
			return clear(id);
		};
		globalThis.__metricsClock = state;
	});
}
async function browserSuccess(server, mode) {
	const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
	const page = await context.newPage();
	const errors = monitor(page);
	await initClock(page);
	const run = 'browser-success';
	const requestStart = server.requests.length;
	try {
		await page.goto(href(server.origin, { run, auth: '1500' }), { waitUntil: 'commit' });
		await page.getByText('Waiting for the request configuration…', { exact: true }).waitFor();
		await page.waitForFunction(() => globalThis.__metricsClock.starts === 1);
		const before = await trace(server.origin, run);
		assert.equal(
			sessionCounts(before).complete,
			0,
			'Metrics activation should be observed while the session is pending in this held case',
		);
		await page.getByText('Export browser trace', { exact: true }).waitFor({ timeout: 10000 });
		await page.waitForFunction(() => globalThis.__metricsClock.ticks >= 1);
		await page.waitForLoadState('load');
		const resources = await page.evaluate(() =>
			performance
				.getEntriesByType('resource')
				.filter((entry) => new URL(entry.name).pathname.endsWith('.js'))
				.map((entry) => ({
					path: new URL(entry.name).pathname,
					encodedBodyBytes: entry.encodedBodySize,
					decodedBodyBytes: entry.decodedBodySize,
					transferBytes: entry.transferSize,
				})),
		);
		assert.ok(resources.length > 0, 'Expected the generated JavaScript to be requested');
		const requests = server.requests
			.slice(requestStart)
			.filter((request) => request.path.endsWith('.js'));
		for (const resource of resources)
			assert.ok(
				requests.some((request) => request.path === resource.path),
				`Missing server response for ${resource.path}`,
			);
		const startup = {
			resources,
			serverResponses: requests,
			encodedBodyBytes: resources.reduce((total, entry) => total + entry.encodedBodyBytes, 0),
			serverBodyBytes: requests.reduce((total, entry) => total + entry.bodyBytes, 0),
		};
		const textarea = page.getByRole('textbox', { name: 'Message', exact: true });
		await textarea.fill('First native observation');
		await page.waitForFunction(() => document.querySelectorAll('.observation-log li').length > 0);
		await page.locator('.metrics summary').click();
		await page.evaluate(() => {
			globalThis.__saved = {
				section: document.querySelector('.metrics'),
				details: document.querySelector('.metrics details'),
				summary: document.querySelector('.metrics summary'),
				row: document.querySelector('.observation-log li'),
				timing: document.querySelector('.timings > div'),
				count: document.querySelectorAll('.observation-log li').length,
				ticks: globalThis.__metricsClock.ticks,
			};
		});
		await textarea.fill('Second native observation');
		await page.locator('.metrics summary').focus();
		await page.waitForFunction(
			() =>
				globalThis.__metricsClock.ticks > globalThis.__saved.ticks &&
				document.querySelectorAll('.observation-log li').length > globalThis.__saved.count,
		);
		const identity = await page.evaluate(() => ({
			section: document.querySelector('.metrics') === globalThis.__saved.section,
			details: document.querySelector('.metrics details') === globalThis.__saved.details,
			row: document.querySelector('.observation-log li') === globalThis.__saved.row,
			timing: document.querySelector('.timings > div') === globalThis.__saved.timing,
			open: document.querySelector('.metrics details').open,
			focused: document.activeElement === globalThis.__saved.summary,
			clock: { ...globalThis.__metricsClock },
		}));
		assert.deepEqual(
			[
				identity.section,
				identity.details,
				identity.row,
				identity.timing,
				identity.open,
				identity.focused,
			],
			[true, true, true, true, true, true],
		);
		assert.equal(identity.clock.starts, 1);
		assert.equal(identity.clock.active, 1);
		const layouts = [];
		for (const width of [1280, 680]) {
			await page.setViewportSize({ width, height: 720 });
			layouts.push(
				await page.evaluate(() => {
					const section = document.querySelector('.metrics');
					const card = document.querySelector('.timings > div');
					return {
						width: innerWidth,
						aria: section.getAttribute('aria-label'),
						children: [...section.children].map((node) => `${node.tagName}:${node.className}`),
						background: getComputedStyle(section).backgroundColor,
						padding: getComputedStyle(section).padding,
						timingsDisplay: getComputedStyle(document.querySelector('.timings')).display,
						cardPadding: getComputedStyle(card).padding,
					};
				}),
			);
		}
		const link = await page.locator('.capture-actions a').evaluate((node) => ({
			href: node.getAttribute('href'),
			target: node.getAttribute('target'),
			rel: node.getAttribute('rel'),
		}));
		assert.deepEqual(link, {
			href: `/__lab/trace?run=${encodeURIComponent(run)}`,
			target: '_blank',
			rel: 'noreferrer',
		});
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Export browser trace' }).click();
		const download = await downloadPromise;
		assert.equal(download.suggestedFilename(), `signal-chat-${run}.json`);
		const data = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
		assert.equal(data.server.run, run);
		assert.equal(data.schemaVersion, 1);
		assert.ok(data.browser.observations.some((item) => item.event === 'native-input'));
		await page.locator('.capture-actions output').getByText('Exported', { exact: true }).waitFor();
		const expectedRows = data.browser.observations.map((entry) => ({
			time: entry.at.toFixed(1),
			text: `${entry.region ?? 'document'} · ${entry.event}${entry.revision === undefined ? '' : ` · r${entry.revision}`}`,
		}));
		await page.waitForFunction(
			(count) => document.querySelectorAll('.observation-log li').length === count,
			expectedRows.length,
		);
		const renderedRows = await page.locator('.observation-log li').evaluateAll((rows) =>
			rows.map((row) => ({
				time: row.querySelector('time').textContent,
				text: row.querySelector('span').textContent,
			})),
		);
		assert.deepEqual(
			renderedRows,
			expectedRows,
			'Rendered log must match the real exported observations',
		);
		const timingRows = await page.locator('.timings > div').evaluateAll((rows) =>
			rows.map((row) => ({
				name: row.querySelector('dt').textContent,
				value: row.querySelector('dd').textContent,
			})),
		);
		assert.deepEqual(
			timingRows,
			['shell', 'answer', 'history', 'tools'].map((region) => {
				const observation = data.browser.observations.find(
					(entry) => entry.region === region && entry.event === 'dom-observed',
				);
				return { name: region, value: observation ? `${observation.at.toFixed(1)} ms` : '—' };
			}),
		);
		await page.route('**/__lab/trace?**', (route) =>
			route.fulfill({ status: 503, body: 'intentional failure' }),
		);
		await page.getByRole('button', { name: 'Export browser trace' }).click();
		await page
			.locator('.capture-actions output')
			.getByText('Error: Producer trace returned 503', { exact: true })
			.waitFor();
		await page.unroute('**/__lab/trace?**');
		const events = await waitTrace(server.origin, run, (items) =>
			['session', 'answer', 'history', 'tools'].every((channel) =>
				items.some((item) => item.channel === channel && item.type === 'finally'),
			),
		);
		assert.deepEqual(sessionCounts(events), { start: 1, complete: 1, abort: 0, finally: 1 });
		assert.equal(
			events.filter(
				(item) => item.channel === 'session' && item.type === 'start' && item.transport === 'rpc',
			).length,
			0,
		);
		await page.evaluate(() =>
			window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })),
		);
		const cleanup = await page.evaluate(() => ({ ...globalThis.__metricsClock }));
		assert.equal(cleanup.stops, 1);
		assert.equal(cleanup.active, 0);
		await page.waitForTimeout(500);
		assert.equal(await page.evaluate(() => globalThis.__metricsClock.ticks), cleanup.ticks);
		assert.deepEqual(errors, []);
		result.cases.push({
			mode,
			case: 'browser-success',
			identity,
			cleanup,
			startup,
			layouts,
			link,
			download: {
				name: download.suggestedFilename(),
				schemaVersion: data.schemaVersion,
				hasNativeInput: true,
			},
			renderedRows,
			timingRows,
			session: sessionCounts(events),
			errors,
		});
	} finally {
		await context.close();
	}
}
async function browserReject(server, mode) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const errors = monitor(page);
	await initClock(page);
	try {
		await page.goto(href(server.origin, { run: 'browser-reject', auth: 'bad' }), {
			waitUntil: 'commit',
		});
		await page.getByText('Capture configuration failed.', { exact: true }).waitFor();
		await page.waitForFunction(() => globalThis.__metricsClock.starts === 1);
		await page.waitForLoadState('load');
		assert.deepEqual(errors, []);
		result.cases.push({
			mode,
			case: 'browser-reject',
			text: await page.locator('.metrics').innerText(),
			errors,
		});
	} finally {
		await context.close();
	}
}
async function browserDisabled(server, mode) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const errors = monitor(page);
	const run = 'browser-disabled';
	try {
		await page.goto(href(server.origin, { run, auth: '50', observe: '0' }), {
			waitUntil: 'commit',
		});
		await page
			.getByText('Observation disabled or waiting for bootstrap.', { exact: true })
			.waitFor();
		await page.getByText('Export browser trace', { exact: true }).waitFor();
		await page.waitForLoadState('load');
		await waitTrace(server.origin, run, (items) =>
			['session', 'answer', 'history', 'tools'].every((channel) =>
				items.some((item) => item.channel === channel && item.type === 'finally'),
			),
		);
		assert.equal(await page.locator('.observation-log li').count(), 0);
		assert.deepEqual(errors, []);
		result.cases.push({ mode, case: 'browser-disabled', errors });
	} finally {
		await context.close();
	}
}
async function browserInflight(server, mode) {
	const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
	const page = await context.newPage();
	const errors = monitor(page);
	await initClock(page);
	const run = 'browser-inflight';
	let release;
	let reached;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	const held = new Promise((resolve) => {
		reached = resolve;
	});
	try {
		await page.goto(href(server.origin, { run, auth: '50' }), { waitUntil: 'commit' });
		await page.getByRole('button', { name: 'Export browser trace' }).waitFor();
		await page.waitForFunction(() => globalThis.__metricsClock.starts === 1);
		await page.waitForLoadState('load');
		await waitTrace(server.origin, run, (items) =>
			['session', 'answer', 'history', 'tools'].every((channel) =>
				items.some((item) => item.channel === channel && item.type === 'finally'),
			),
		);
		await page.route('**/__lab/trace?**', async (route) => {
			reached();
			await gate;
			await route.continue();
		});
		await page.getByRole('button', { name: 'Export browser trace' }).click();
		await held;
		await page
			.locator('.capture-actions output')
			.getByText('Exporting…', { exact: true })
			.waitFor();
		const download = page.waitForEvent('download');
		await page.evaluate(() =>
			window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })),
		);
		const clock = await page.evaluate(() => ({ ...globalThis.__metricsClock }));
		assert.equal(clock.stops, 1);
		assert.equal(clock.active, 0);
		release();
		const file = await download;
		const data = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
		assert.equal(data.server.run, run);
		assert.equal(file.suggestedFilename(), `signal-chat-${run}.json`);
		assert.deepEqual(errors, []);
		result.cases.push({
			mode,
			case: 'browser-export-after-dispose',
			clock,
			downloadedRun: data.server.run,
			errors,
		});
	} finally {
		release();
		await context.close();
	}
}
try {
	for (const mode of ['original', 'shared']) {
		const server = await startServer(mode);
		for (const kind of ['success', 'reject', 'abort']) await streamCase(server, mode, kind);
		await browserSuccess(server, mode);
		await browserReject(server, mode);
		await browserDisabled(server, mode);
		await browserInflight(server, mode);
		const logs = server.logs();
		const headers = logs.split('\n').filter((line) => line && !line.startsWith('    at '));
		assert.deepEqual(
			headers,
			Array(4).fill(
				'[octane] SSR render error: Error: The client disconnected before the request completed.',
			),
			`${mode}: unexpected server diagnostics`,
		);
		result.cases.push({ mode, case: 'server-diagnostics', logs });
	}
	assert.deepEqual(
		result.cases.find((item) => item.mode === 'original' && item.case === 'browser-success')
			.layouts,
		result.cases.find((item) => item.mode === 'shared' && item.case === 'browser-success').layouts,
		'Metrics element structure and selected computed styles must agree',
	);
} catch (error) {
	result.error = error.stack ?? String(error);
	process.exitCode = 1;
} finally {
	await browser.close();
	for (const { child } of servers) {
		child.kill();
		await once(child, 'exit');
	}
	fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
	console.log(
		JSON.stringify(
			{
				output,
				cases: result.cases.map((item) => `${item.mode}/${item.case}`),
				error: result.error,
			},
			null,
			2,
		),
	);
}
