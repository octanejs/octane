import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { digest, toolchain, tree } from '../signal-chat-route/evidence.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const directory = path.resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Pass the output directory printed by build.mjs');
assert.ok(process.env.PLAYWRIGHT_EXECUTABLE_PATH, 'Set the authorized Chromium executable');
const report = JSON.parse(fs.readFileSync(path.join(directory, 'build-report.json'), 'utf8'));
assert.deepEqual(
	tree(path.join(repo, 'examples/signal-chat')),
	report.source,
	'App source changed',
);
assert.deepEqual(tree(path.join(directory, 'project')), report.source, 'Copied app source changed');
assert.deepEqual(toolchain(repo), report.toolchain, 'Selected toolchain changed');
for (const [file, expected] of Object.entries(report.experiment))
	assert.equal(
		digest(fs.readFileSync(path.join(import.meta.dirname, file))),
		expected,
		`${file} changed`,
	);
assert.deepEqual(
	tree(path.join(directory, 'project/dist'), new Set()),
	report.artifactFiles,
	'Emitted build changed',
);

const manifest = JSON.parse(report.clientManifest);
const composer = manifest['src/App.tsrx?octane-hydrate=2'];
assert.ok(composer, 'The compiled Composer activation must be present');
const conversation = manifest['src/App.tsrx?octane-hydrate=1'];
assert.ok(conversation, 'The compiled Conversation activation must be present');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({
	executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
	headless: true,
	ignoreDefaultArgs: ['--disable-back-forward-cache'],
});
const child = fork(
	path.join(repo, 'benchmarks/streamed-shell-prototype/signal-chat-route/server.mjs'),
	[path.join(directory, 'project')],
	{
		stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
	},
);
let serverLogs = '';
child.stdout.on('data', (chunk) => {
	serverLogs += String(chunk);
});
child.stderr.on('data', (chunk) => {
	serverLogs += String(chunk);
});
const [message] = await Promise.race([
	once(child, 'message'),
	once(child, 'exit').then(([code]) => {
		throw new Error(`Server exited ${code}: ${serverLogs}`);
	}),
]);
const origin = `http://127.0.0.1:${message.port}`;
const results = [];

function urlFor(mode, run, options = {}) {
	const url = new URL(options.eager ? '/eager' : '/', origin);
	for (const [key, value] of Object.entries({
		auth: '40',
		answer: '60',
		history: '120',
		interval: '30',
		waves: '4',
		turns: '3',
		historyRows: '5',
		run,
		...options.params,
	}))
		url.searchParams.set(key, value);
	if (mode === 'ordinary') url.searchParams.set('__ordinaryRoot', '1');
	return url.href;
}
async function trace(run) {
	const response = await fetch(`${origin}/__lab/trace?run=${encodeURIComponent(run)}`);
	assert.equal(response.status, 200);
	const result = await response.json();
	assert.equal(result.run, run);
	assert.equal(result.truncated, false);
	return result;
}
async function waitTrace(run, predicate) {
	for (let attempt = 0; attempt < 200; attempt++) {
		const result = await trace(run);
		if (predicate(result.events)) return result.events;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(`Timed out waiting for producer events for ${run}`);
}
function diagnostics(page) {
	const errors = [];
	const canceled = [];
	page.on('pageerror', (error) => errors.push(`pageerror: ${error}`));
	page.on('console', (message) => {
		if (!['warning', 'error'].includes(message.type())) return;
		if (message.location().url?.endsWith('/favicon.ico') && message.text().includes('404')) return;
		errors.push(`${message.type()}: ${message.text()}`);
	});
	page.on('requestfailed', (request) => {
		const failure = `${request.url()} ${request.failure()?.errorText}`;
		if (
			request.failure()?.errorText === 'net::ERR_ABORTED' &&
			new URL(request.url()).pathname.startsWith('/_$_ripple_rpc_$_/')
		)
			canceled.push(failure);
		else errors.push(failure);
	});
	return { errors, canceled };
}
async function checkpoint(page, mode) {
	await page.waitForFunction(() => globalThis.__octaneIslandsFirstCheckpoint?.registryStarts === 1);
	if (mode === 'ordinary')
		await page.waitForFunction(
			() => globalThis.__octaneIslandsFirstCheckpoint.rootHydrateCalls === 1,
		);
	else
		await page.waitForFunction(() => globalThis.__octaneIslandsFirstCheckpoint.preHydrateCompleted);
	const result = await page.evaluate(() => globalThis.__octaneIslandsFirstCheckpoint);
	assert.equal(result.selection, mode === 'ordinary' ? 'ordinary' : 'islands-first');
	assert.equal(result.registryStarts, 1);
	assert.equal(result.rootHydrateCalls, mode === 'ordinary' ? 1 : 0);
	assert.equal(result.hasSignalOwner, true);
	assert.equal(result.hasStreamReceiver, true);
	return result;
}

async function earlyAndNavigation(mode) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	await page.addInitScript(() => {
		window.addEventListener('pageshow', (event) => {
			globalThis.__lastPageShowPersisted = event.persisted;
		});
	});
	const diagnosticsResult = diagnostics(page);
	const run = randomUUID();
	let release;
	let resolveHeld;
	const hold = new Promise((resolve) => {
		release = resolve;
	});
	const held = new Promise((resolve) => {
		resolveHeld = resolve;
	});
	await page.route('**/*', async (route) => {
		if (new URL(route.request().url()).pathname === `/${composer.file}`) {
			resolveHeld();
			await hold;
		}
		await route.continue();
	});
	try {
		const response = await page.goto(urlFor(mode, run), { waitUntil: 'commit' });
		assert.ok(response);
		await page.waitForFunction(
			() => globalThis.__octaneIslandsFirstCheckpoint?.registryStarts === 1,
		);
		const input = page.getByRole('textbox', { name: 'Message', exact: true });
		await input.waitFor();
		await page.locator('[data-answer]').waitFor();
		await page.evaluate(() => {
			globalThis.__checkpointNodes = {
				input: document.querySelector('#message'),
				message: document.querySelector('[data-message-id]'),
			};
		});
		await input.fill('Preserve this early draft');
		await input.evaluate((element) => {
			element.focus();
			element.setSelectionRange(3, 9);
		});
		await Promise.race([
			held,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Composer activation was not held')), 10000),
			),
		]);
		assert.notEqual(
			await page.locator('[data-composer-ready]').getAttribute('data-composer-ready'),
			'true',
		);
		await response.finished();
		const html = await response.text();
		const receivedFrames = (html.match(/__octaneStreamedRenderer\.receive\(/g) ?? []).length;
		assert.ok(
			receivedFrames > 0,
			'Browser must receive the streaming frames before Composer activation',
		);
		const events = await waitTrace(run, (items) =>
			items.some((event) => event.channel === 'answer' && event.type === 'complete'),
		);
		assert.equal(
			events.filter(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'yield',
			).length,
			4,
		);
		assert.equal(await page.locator('[data-answer]').getAttribute('data-revision'), '1');
		release();
		await page.waitForFunction(() => document.querySelector('[data-composer-ready="true"]'));
		await page.waitForFunction(
			() => document.querySelector('[data-draft-length]')?.textContent === '25',
		);
		const adopted = await page.evaluate(() => ({
			input: globalThis.__checkpointNodes.input === document.querySelector('#message'),
			message: globalThis.__checkpointNodes.message === document.querySelector('[data-message-id]'),
			value: document.querySelector('#message').value,
			focus: document.activeElement === document.querySelector('#message'),
			selection: [
				document.querySelector('#message').selectionStart,
				document.querySelector('#message').selectionEnd,
			],
		}));
		assert.deepEqual(adopted, {
			input: true,
			message: true,
			value: 'Preserve this early draft',
			focus: true,
			selection: [3, 9],
		});
		for (const name of ['Activate conversation', 'Activate history', 'Activate tools'])
			await page.getByRole('button', { name, exact: true }).click();
		for (const selector of ['[data-answer]', '[data-history]', '[data-tools]'])
			await page.waitForFunction(
				(name) => document.querySelector(name)?.getAttribute('data-revision') === '4',
				selector,
			);
		assert.equal(await page.locator('[data-history] li').count(), 5);
		await page.getByRole('button', { name: 'Send message', exact: true }).click();
		await page.waitForFunction(
			() =>
				document.querySelector('[data-answer]')?.getAttribute('data-generation') === '1' &&
				document.querySelector('[data-answer]')?.getAttribute('data-revision') === '4',
		);
		assert.equal(
			await page.locator('[data-current-prompt]').textContent(),
			'Preserve this early draft',
		);
		assert.equal(await input.inputValue(), '');
		const afterSend = await trace(run);
		for (const channel of ['session', 'history', 'tools'])
			assert.equal(
				afterSend.events.filter(
					(event) =>
						event.channel === channel && event.type === 'start' && event.transport === 'document',
				).length,
				1,
			);
		assert.equal(
			afterSend.events.filter(
				(event) =>
					event.channel === 'answer' && event.type === 'start' && event.transport === 'document',
			).length,
			1,
		);
		assert.equal(
			afterSend.events.filter(
				(event) =>
					event.channel === 'answer' && event.type === 'start' && event.transport === 'rpc',
			).length,
			1,
		);
		const selected = await checkpoint(page, mode);
		const styles = await page.evaluate(() => ({
			loaded: [...document.querySelectorAll('link[rel="stylesheet"]')].every(
				(link) => !!link.sheet,
			),
			count: document.querySelectorAll('link[rel="stylesheet"]').length,
			display: getComputedStyle(document.querySelector('.workspace')).display,
			font: getComputedStyle(document.body).fontFamily,
		}));
		assert.ok(styles.loaded && styles.count > 0);
		const form = page.getByRole('region', { name: 'Run configuration', exact: true });
		await form.getByLabel(/^Stream snapshots/).fill('4');
		await form.getByLabel(/^Total turns/).fill('2');
		await form.getByLabel(/^History rows/).fill('5');
		await Promise.all([
			page.waitForURL('**/eager?**'),
			form.getByRole('button', { name: 'Run eager', exact: true }).click(),
		]);
		await page.waitForLoadState('load');
		assert.equal(new URL(page.url()).searchParams.get('historyRows'), '5');
		await page.waitForFunction(
			() => globalThis.__octaneIslandsFirstCheckpoint?.rootHydrateCalls === 1,
		);
		const eager = await page.evaluate(() => globalThis.__octaneIslandsFirstCheckpoint);
		assert.equal(eager.selection, 'ordinary');
		assert.equal(eager.eligible, false);
		await page.waitForFunction(
			() => document.querySelector('[data-history]')?.getAttribute('data-revision') === '4',
		);
		assert.equal(await page.locator('[data-history] li').count(), 5);
		await page.goBack({ waitUntil: 'commit' });
		await page.waitForFunction(
			() => globalThis.__octaneIslandsFirstCheckpoint?.registryStarts === 1,
		);
		const persisted = await page.evaluate(() => globalThis.__lastPageShowPersisted === true);
		if (persisted) {
			assert.equal(
				await page.evaluate(
					() => globalThis.__checkpointNodes.input === document.querySelector('#message'),
				),
				true,
			);
			assert.equal(
				await page.locator('[data-current-prompt]').textContent(),
				'Preserve this early draft',
			);
			await input.fill('After returning from the cache');
			await page.getByRole('button', { name: 'Send message', exact: true }).click();
			await page.waitForFunction(
				() =>
					document.querySelector('[data-answer]')?.getAttribute('data-generation') === '2' &&
					document.querySelector('[data-answer]')?.getAttribute('data-revision') === '4',
			);
			assert.equal(
				await page.locator('[data-current-prompt]').textContent(),
				'After returning from the cache',
			);
		}
		assert.equal(
			await page.evaluate(() => globalThis.__octaneIslandsFirstCheckpoint.selection),
			mode,
		);
		assert.deepEqual(diagnosticsResult.errors, []);
		return {
			selected,
			receivedFrames,
			adopted,
			styles,
			eager,
			navigationRows: 5,
			backForwardCacheRestored: persisted,
			canceledRequests: diagnosticsResult.canceled,
		};
	} finally {
		release();
		await context.close();
	}
}

async function liveStream(mode) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const diagnostic = diagnostics(page);
	const run = randomUUID();
	try {
		const response = await page.goto(urlFor(mode, run, { params: { interval: '1000' } }), {
			waitUntil: 'commit',
		});
		assert.ok(response);
		await page.locator('[data-answer]').waitFor();
		assert.equal(await page.locator('[data-answer]').getAttribute('data-revision'), '1');
		await page.evaluate(() => {
			globalThis.__liveMessage = document.querySelector('[data-message-id]');
		});
		await page.getByRole('button', { name: 'Activate conversation', exact: true }).click();
		await page.waitForFunction(
			() => document.querySelector('[data-answer]')?.getAttribute('data-revision') === '2',
		);
		const during = await trace(run);
		assert.ok(
			!during.events.some(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'complete',
			),
		);
		await page.waitForFunction(
			() => document.querySelector('[data-answer]')?.getAttribute('data-revision') === '4',
		);
		assert.equal(
			await page.evaluate(
				() => globalThis.__liveMessage === document.querySelector('[data-message-id]'),
			),
			true,
		);
		const events = await waitTrace(run, (items) =>
			items.some(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'finally',
			),
		);
		assert.equal(
			events.filter(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'yield',
			).length,
			4,
		);
		assert.equal(
			events.filter(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'start',
			).length,
			1,
		);
		assert.ok(
			events.some(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'complete',
			),
		);
		await response.finished();
		const selected = await checkpoint(page, mode);
		assert.deepEqual(diagnostic.errors, []);
		return {
			selected,
			revisionBeforeCompletion: 2,
			finalRevision: 4,
			preservedMessage: true,
			canceledRequests: diagnostic.canceled,
		};
	} finally {
		await context.close();
	}
}

async function failureAndCleanup(mode) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const diagnostic = diagnostics(page);
	const run = randomUUID();
	let release;
	let resolveHeld;
	const hold = new Promise((resolve) => {
		release = resolve;
	});
	const held = new Promise((resolve) => {
		resolveHeld = resolve;
	});
	await page.route('**/*', async (route) => {
		if (new URL(route.request().url()).pathname === `/${conversation.file}`) {
			resolveHeld();
			await hold;
		}
		await route.continue();
	});
	try {
		await page.goto(urlFor(mode, run, { params: { scenario: 'fail-before' } }), {
			waitUntil: 'commit',
		});
		await page.getByText('Response failed', { exact: true }).waitFor();
		await page.waitForFunction(
			() => globalThis.__octaneIslandsFirstCheckpoint?.registryStarts === 1,
		);
		await page.evaluate(() => {
			globalThis.__retryTarget = [...document.querySelectorAll('button')].find((button) =>
				button.textContent.includes('Retry response'),
			);
		});
		await page.getByRole('button', { name: 'Retry response', exact: true }).click();
		await Promise.race([
			held,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Conversation activation was not held')), 10000),
			),
		]);
		assert.equal(
			(await trace(run)).events.filter(
				(event) =>
					event.channel === 'answer' && event.type === 'start' && event.transport === 'rpc',
			).length,
			0,
		);
		release();
		await page.waitForFunction(
			() => globalThis.__retryTarget && !globalThis.__retryTarget.isConnected,
		);
		assert.equal(
			(await trace(run)).events.filter(
				(event) =>
					event.channel === 'answer' && event.type === 'start' && event.transport === 'rpc',
			).length,
			0,
			'A replaced target must not replay the stale Retry click',
		);
		await page.getByRole('button', { name: 'Retry response', exact: true }).click();
		await page.waitForFunction(
			() => document.querySelector('[data-answer]')?.getAttribute('data-revision') === '4',
		);
		const events = await trace(run);
		assert.deepEqual(
			events.events
				.filter((event) => event.channel === 'answer' && event.type === 'start')
				.map((event) => event.transport),
			['document', 'rpc'],
		);
		const selected = await checkpoint(page, mode);
		assert.deepEqual(diagnostic.errors, []);
		return {
			selected,
			staleRetryTargetReplaced: true,
			staleRetryDidNotReplay: true,
			retryStarts: ['document', 'rpc'],
			canceledRequests: diagnostic.canceled,
		};
	} finally {
		release();
		await context.close();
	}
}

async function queuedSend(mode) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const diagnostic = diagnostics(page);
	const run = randomUUID();
	let release;
	let resolveHeld;
	const hold = new Promise((resolve) => {
		release = resolve;
	});
	const held = new Promise((resolve) => {
		resolveHeld = resolve;
	});
	await page.route('**/*', async (route) => {
		if (new URL(route.request().url()).pathname === `/${composer.file}`) {
			resolveHeld();
			await hold;
		}
		await route.continue();
	});
	try {
		await page.goto(urlFor(mode, run), { waitUntil: 'commit' });
		await page.waitForFunction(
			() => globalThis.__octaneIslandsFirstCheckpoint?.registryStarts === 1,
		);
		const input = page.getByRole('textbox', { name: 'Message', exact: true });
		await input.fill('Send queued before activation');
		await Promise.race([
			held,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Composer activation was not held')), 10000),
			),
		]);
		await page.evaluate(() => {
			globalThis.__sendTarget = [...document.querySelectorAll('button')].find((button) =>
				button.textContent.includes('Send message'),
			);
		});
		await page.getByRole('button', { name: 'Send message', exact: true }).click();
		assert.equal(
			(await trace(run)).events.filter(
				(event) =>
					event.channel === 'answer' && event.transport === 'rpc' && event.type === 'start',
			).length,
			0,
		);
		release();
		await page.waitForFunction(
			() =>
				document.querySelector('[data-answer]')?.getAttribute('data-generation') === '1' &&
				document.querySelector('[data-answer]')?.getAttribute('data-revision') === '4',
		);
		assert.equal(
			await page.locator('[data-current-prompt]').textContent(),
			'Send queued before activation',
		);
		assert.equal(await page.evaluate(() => globalThis.__sendTarget?.isConnected), true);
		const events = await trace(run);
		assert.equal(
			events.events.filter(
				(event) =>
					event.channel === 'answer' && event.transport === 'rpc' && event.type === 'start',
			).length,
			1,
		);
		const selected = await checkpoint(page, mode);
		assert.deepEqual(diagnostic.errors, []);
		return {
			selected,
			queuedSendReplayed: true,
			retainedTarget: true,
			rpcStarts: 1,
			canceledRequests: diagnostic.canceled,
		};
	} finally {
		release();
		await context.close();
	}
}

async function retirePending(mode) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const run = randomUUID();
	let release;
	let resolveHeld;
	const hold = new Promise((resolve) => {
		release = resolve;
	});
	const held = new Promise((resolve) => {
		resolveHeld = resolve;
	});
	await page.route('**/*', async (route) => {
		if (new URL(route.request().url()).pathname === `/${composer.file}`) {
			resolveHeld();
			await hold;
		}
		try {
			await route.continue();
		} catch {
			/* the context was deliberately retired */
		}
	});
	try {
		await page.goto(urlFor(mode, run, { params: { interval: '1000' } }), { waitUntil: 'commit' });
		await page.locator('[data-answer]').waitFor();
		await page.waitForFunction(
			() => globalThis.__octaneIslandsFirstCheckpoint?.registryStarts === 1,
		);
		assert.equal(
			await page.evaluate(() => globalThis.__octaneIslandsFirstCheckpoint.selection),
			mode,
		);
		await page.getByRole('textbox', { name: 'Message', exact: true }).focus();
		await Promise.race([
			held,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Composer activation was not held')), 10000),
			),
		]);
		assert.notEqual(
			await page.locator('[data-composer-ready]').getAttribute('data-composer-ready'),
			'true',
		);
		const beforeClose = (await trace(run)).events.filter(
			(event) => event.channel === 'answer' && event.transport === 'document',
		);
		assert.equal(beforeClose.filter((event) => event.type === 'start').length, 1);
		assert.ok(!beforeClose.some((event) => event.type === 'complete' || event.type === 'finally'));
		const priorLogLength = serverLogs.length;
		await context.close();
		release();
		const events = await waitTrace(run, (items) =>
			items.some(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'finally',
			),
		);
		assert.equal(
			events.filter(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'start',
			).length,
			1,
		);
		assert.ok(
			!events.some(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'complete',
			),
			'The answer producer should be canceled rather than complete',
		);
		let serverDiagnostic = '';
		for (let attempt = 0; attempt < 100; attempt++) {
			serverDiagnostic = serverLogs.slice(priorLogLength);
			if (serverDiagnostic.includes('The client disconnected before the request completed.')) break;
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		const lines = serverDiagnostic.trim().split('\n');
		const expected =
			'[octane] SSR render error: Error: The client disconnected before the request completed.';
		assert.equal(
			lines.filter((line) => line === expected).length,
			1,
			'Each deliberate close must report exactly one disconnect',
		);
		assert.ok(
			lines.every((line) => line === expected || /^\s+at /.test(line)),
			'Unexpected server diagnostics during close',
		);
		return {
			run,
			activationPendingAtClose: true,
			answerProducerOpenBeforeClose: true,
			answerProducerFinally: true,
			answerProducerCompleted: false,
			serverDiagnostic,
		};
	} finally {
		release();
		await context.close();
	}
}

async function metricsDuringSession(mode) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const diagnostic = diagnostics(page);
	const run = randomUUID();
	try {
		const response = await page.goto(urlFor(mode, run, { params: { auth: '1800' } }), {
			waitUntil: 'commit',
		});
		await page.locator('[aria-label="Capture measurements"]').waitFor();
		let activationBeforeComplete = false;
		let sessionComplete = false;
		for (let attempt = 0; attempt < 100; attempt++) {
			const events = (await trace(run)).events;
			sessionComplete = events.some(
				(event) => event.channel === 'session' && event.type === 'complete',
			);
			const recorded = (await page.locator('.observation-log').textContent())?.includes(
				'metrics · activated',
			);
			if (recorded && !sessionComplete) {
				activationBeforeComplete = true;
				break;
			}
			if (sessionComplete) break;
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		await response.finished();
		const selected = await checkpoint(page, mode);
		assert.deepEqual(diagnostic.errors, []);
		return {
			selected,
			activationBeforeComplete,
			sessionCompleteAtLastSample: sessionComplete,
			canceledRequests: diagnostic.canceled,
		};
	} finally {
		await context.close();
	}
}

try {
	for (const mode of ['islands-first', 'ordinary']) {
		const early = await earlyAndNavigation(mode);
		const live = await liveStream(mode);
		const failure = await failureAndCleanup(mode);
		const send = await queuedSend(mode);
		const retirement = await retirePending(mode);
		const metrics = await metricsDuringSession(mode);
		results.push({ mode, early, live, failure, send, retirement, metrics });
		process.stderr.write(`Completed ${mode}.\n`);
	}
	assert.deepEqual(results[0].early.styles, results[1].early.styles, 'Computed CSS must match');
	assert.equal(
		serverLogs,
		results.map((result) => result.retirement.serverDiagnostic).join(''),
		'Only the two run-correlated deliberate disconnect diagnostics are expected',
	);
	const output = {
		buildReportSha256: digest(fs.readFileSync(path.join(directory, 'build-report.json'))),
		browser: browser.version(),
		node: process.version,
		results,
		serverDiagnostics: serverLogs,
	};
	const file = path.join(directory, 'browser-report.json');
	fs.writeFileSync(file, JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
	console.log(
		JSON.stringify(
			{ file, browser: output.browser, modes: results.map((result) => result.mode) },
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
