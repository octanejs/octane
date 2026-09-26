import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { digest, toolchain, tree } from './evidence.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { chromium } = require('playwright');
const arg = (name) =>
	process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
assert.ok(arg('build-dir'), 'Pass --build-dir= from prepare.mjs');
const directory = path.resolve(arg('build-dir'));
const smoke = process.argv.includes('--smoke');
const samples = Number(arg('samples') ?? (smoke ? 1 : 2));
assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 10, 'Use 1–10 samples');
assert.ok(
	process.env.PLAYWRIGHT_EXECUTABLE_PATH,
	'Set an explicitly authorized Playwright Chromium path',
);
const build = JSON.parse(fs.readFileSync(path.join(directory, 'build-report.json'), 'utf8'));
const provenance = JSON.parse(fs.readFileSync(path.join(directory, 'provenance.json'), 'utf8'));
assert.equal(build.sourceSha256, provenance.sourceSha256);
assert.equal(build.toolchainSha256, provenance.toolchainSha256);
assert.equal(digest(JSON.stringify(provenance.source)), provenance.sourceSha256);
assert.equal(digest(JSON.stringify(provenance.toolchain)), provenance.toolchainSha256);
assert.deepEqual(
	tree(path.join(directory, 'source')),
	provenance.source,
	'Snapshot changed since build',
);
assert.deepEqual(
	toolchain(repo),
	provenance.toolchain,
	'Selected toolchain sources changed since build',
);
for (const [variant, stats] of Object.entries(build.stats)) {
	assert.deepEqual(
		tree(path.join(directory, variant, 'project/dist'), new Set()),
		stats.artifactFiles,
		`${variant}: emitted artifacts changed`,
	);
	assert.equal(
		digest(fs.readFileSync(path.join(directory, variant, 'client-manifest.json'))),
		stats.clientManifestSha256,
		`${variant}: manifest changed`,
	);
	assert.equal(
		digest(fs.readFileSync(path.join(directory, variant, 'build.json'))),
		stats.buildMetadataSha256,
		`${variant}: build metadata changed`,
	);
	for (const group of ['allReachableJs', 'css']) {
		for (const [file, expected] of Object.entries(stats[group].files)) {
			const actual = fs.readFileSync(path.join(directory, variant, 'project/dist/client', file));
			assert.equal(digest(actual), expected.sha256, `${variant}: emitted ${file} changed`);
		}
	}
}
const browser = await chromium.launch({
	executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
	headless: true,
	timeout: 15000,
});
const settings = { auth: '40', answer: '60', history: '120', interval: '30', waves: '4' };
const profiles = {
	medium: { turns: '20', historyRows: '10' },
	large: { turns: '200', historyRows: '60' },
};
function urlFor(origin, scenario, run, profile) {
	const pathname = scenario === 'eager' ? '/eager' : '/';
	const url = new URL(pathname, origin);
	for (const [key, value] of Object.entries({ ...settings, ...profile }))
		url.searchParams.set(key, value);
	url.searchParams.set('run', run);
	if (scenario === 'delayed') url.searchParams.set('hydrateDelay', '800');
	if (scenario === 'failure') url.searchParams.set('scenario', 'fail-before');
	return url.href;
}
async function startServer(variant) {
	const project = path.join(directory, variant, 'project');
	const child = fork(path.join(here, 'server.mjs'), [project], {
		stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
	});
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
			throw new Error(`${variant} server exited ${code}: ${logs}`);
		}),
		new Promise((_, reject) => {
			setTimeout(() => reject(new Error('Server did not listen')), 10000).unref();
		}),
	]);
	const requests = [];
	child.on('message', (event) => {
		if (event.request) requests.push(event.request);
	});
	return { child, origin: `http://127.0.0.1:${message.port}`, logs: () => logs, requests };
}
async function trace(origin, run) {
	const response = await fetch(`${origin}/__lab/trace?run=${encodeURIComponent(run)}`);
	assert.equal(response.status, 200);
	const result = await response.json();
	assert.equal(result.run, run);
	assert.equal(result.truncated, false);
	return result;
}
async function httpSample(origin, scenario, profile) {
	const run = randomUUID();
	const started = performance.now();
	const response = await fetch(urlFor(origin, scenario, run, profile), {
		headers: { 'accept-encoding': 'identity' },
		signal: AbortSignal.timeout(15000),
	});
	assert.equal(response.status, 200);
	const chunks = [];
	for await (const part of response.body)
		chunks.push({ atMs: performance.now() - started, bytes: Buffer.from(part) });
	const bytes = Buffer.concat(chunks.map((chunk) => chunk.bytes));
	const html = bytes.toString('utf8');
	assert.ok(html.includes('data-lab-shell'));
	assert.ok(html.includes('data-history'));
	assert.ok(html.includes('data-tools'));
	if (scenario === 'failure') assert.ok(html.includes('Response failed'));
	else assert.ok(html.includes('data-answer'));
	const streams = [
		...html.matchAll(/<script\b[^>]*\bdata-octane-stream\b[^>]*>[\s\S]*?<\/script>/gi),
	];
	const traceData = await trace(origin, run);
	for (const channel of ['session', 'answer', 'history', 'tools']) {
		const events = traceData.events.filter(
			(event) => event.channel === channel && event.transport === 'document',
		);
		assert.equal(events.filter((event) => event.type === 'start').length, 1, `${channel} starts`);
		assert.equal(
			events.filter((event) => event.type === 'finally').length,
			1,
			`${channel} cleanup`,
		);
		if (channel !== 'session' && !(scenario === 'failure' && channel === 'answer')) {
			assert.equal(
				events.filter((event) => event.type === 'yield').length,
				Number(settings.waves),
				`${channel} yields`,
			);
		}
		assert.equal(
			events.filter(
				(event) =>
					event.type === (scenario === 'failure' && channel === 'answer' ? 'error' : 'complete'),
			).length,
			1,
			`${channel} terminal`,
		);
	}
	return {
		status: response.status,
		encoding: response.headers.get('content-encoding'),
		bytes: bytes.length,
		gzip9Offline: gzipSync(bytes, { level: 9 }).length,
		chunks: chunks.map(({ atMs, bytes }) => ({ atMs, bytes: bytes.length })),
		streamScriptBytes: streams.reduce((total, match) => total + Buffer.byteLength(match[0]), 0),
		signalReceiveCalls: (html.match(/__octaneStreamedRenderer\.receive\(/g) ?? []).length,
		pendingAnswer: html.includes('Waiting for the first answer'),
		trace: traceData,
	};
}
function diagnostics(page) {
	const errors = [];
	Object.defineProperty(errors, 'abortedRequests', { value: [], enumerable: false });
	page.on('pageerror', (error) => errors.push(`pageerror: ${error}`));
	page.on('console', (message) => {
		if (['error', 'warning'].includes(message.type())) {
			const location = message.location().url;
			if (
				location &&
				new URL(location).pathname === '/favicon.ico' &&
				message.text().includes('404')
			)
				return;
			errors.push(`${message.type()}: ${message.text()}`);
		}
	});
	page.on('requestfailed', (request) => {
		const diagnostic = `${request.url()} ${request.failure()?.errorText}`;
		if (request.failure()?.errorText === 'net::ERR_ABORTED')
			errors.abortedRequests.push(diagnostic);
		else errors.push(`requestfailed: ${diagnostic}`);
	});
	return errors;
}
async function startupSample(server, variant, scenario, profileName, profile) {
	const { origin } = server;
	await new Promise((resolve) => setTimeout(resolve, 50));
	const requestStart = server.requests.length;
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const errors = diagnostics(page);
	const requests = [];
	page.on('request', (request) => requests.push(request));
	const run = randomUUID();
	try {
		const started = performance.now();
		await page.goto(urlFor(origin, scenario, run, profile), { waitUntil: 'load', timeout: 15000 });
		if (scenario === 'delayed') await page.waitForTimeout(900);
		await page.waitForLoadState('networkidle', { timeout: 15000 });
		if (scenario === 'failure') {
			await page.getByText('Response failed', { exact: true }).waitFor({ timeout: 10000 });
		} else {
			await page.locator('[data-answer]').waitFor({ timeout: 10000 });
			if (scenario === 'eager')
				await page.waitForFunction(
					() => document.querySelector('[data-answer]')?.getAttribute('data-revision') === '4',
				);
		}
		const observed = await page.evaluate(() => ({
			navigation: performance.getEntriesByType('navigation').map((entry) => entry.toJSON()),
			resources: performance.getEntriesByType('resource').map((entry) => entry.toJSON()),
			dom: {
				activation: document.querySelector('[data-lab-shell]')?.getAttribute('data-activation'),
				answerRevision:
					document.querySelector('[data-answer]')?.getAttribute('data-revision') ?? null,
				historyRevision:
					document.querySelector('[data-history]')?.getAttribute('data-revision') ?? null,
				toolsRevision:
					document.querySelector('[data-tools]')?.getAttribute('data-revision') ?? null,
				historyRows: document.querySelectorAll('[data-history] li').length,
				previousMessages: document.querySelectorAll('[data-message-id]').length,
			},
		}));
		assert.ok(observed.dom.historyRevision, 'History content is present');
		assert.equal(
			observed.dom.historyRows,
			Math.ceil(
				(Number(profile.historyRows) * Number(observed.dom.historyRevision)) /
					Number(settings.waves),
			),
		);
		if (scenario !== 'failure')
			assert.equal(observed.dom.previousMessages, 2 * (Number(profile.turns) - 1));
		if (scenario === 'eager') assert.equal(observed.dom.historyRows, Number(profile.historyRows));
		await page.waitForTimeout(100); // Allow browser-generated favicon and Node finish messages to arrive.
		const served = server.requests.slice(requestStart);
		assert.ok(
			served.some((request) => request.path === (scenario === 'eager' ? '/eager' : '/')),
			'Server observed document',
		);
		const network = [];
		for (const request of requests) {
			const response = await request.response();
			assert.ok(response, `No response for ${request.url()}`);
			assert.equal(await request.failure(), null);
			const sizes = await request.sizes();
			assert.ok(
				sizes.responseBodySize >= 0 && sizes.responseHeadersSize >= 0,
				`Missing response sizes for ${request.url()}`,
			);
			const headers = await response.allHeaders();
			network.push({
				url: new URL(request.url()).pathname,
				type: request.resourceType(),
				status: response.status(),
				contentEncoding: headers['content-encoding'] ?? null,
				...sizes,
			});
		}
		const unmatched = [...served];
		for (const request of network) {
			const index = unmatched.findIndex(
				(entry) => entry.path === request.url && entry.status === request.status,
			);
			assert.notEqual(index, -1, `No server record for ${request.url}`);
			unmatched.splice(index, 1);
		}
		assert.ok(
			unmatched.every((entry) => entry.path === '/favicon.ico'),
			'Unexpected requests invisible to the page observer',
		);
		assert.deepEqual(errors, []);
		return {
			variant,
			scenario,
			profile: profileName,
			elapsedToIdleMs: performance.now() - started,
			observed,
			network,
			served,
			serverOnlyRequests: unmatched,
			servedBodyBytes: served.reduce((sum, entry) => sum + entry.bodyBytes, 0),
			servedHeaderBytes: served.reduce((sum, entry) => sum + entry.headerBytes, 0),
			abortedRequests: errors.abortedRequests,
			responseBodyBytes: network.reduce((sum, entry) => sum + entry.responseBodySize, 0),
			responseHeaderBytes: network.reduce((sum, entry) => sum + entry.responseHeadersSize, 0),
		};
	} finally {
		await context.close();
	}
}
async function deferredBehavior(origin, profile) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const errors = diagnostics(page);
	const run = randomUUID();
	let release;
	const hold = new Promise((resolve) => {
		release = resolve;
	});
	await page.route('**/*', async (route) => {
		if (route.request().resourceType() === 'script') await hold;
		await route.continue();
	});
	try {
		const documentResponse = await page.goto(urlFor(origin, 'deferred', run, profile), {
			waitUntil: 'commit',
		});
		assert.ok(documentResponse);
		const composer = page.getByRole('textbox', { name: 'Message', exact: true });
		await composer.waitFor();
		await page.locator('[data-answer]').waitFor();
		assert.ok(
			await page.locator('[data-message-id]').count(),
			'Expected a prior transcript node to adopt',
		);
		await page.evaluate(() => {
			window.__routeEvidence = {
				composer: document.querySelector('#message'),
				message: document.querySelector('[data-message-id]'),
			};
		});
		await composer.fill('Preserve this early draft');
		await composer.evaluate((element) => {
			element.focus();
			element.setSelectionRange(3, 9);
		});
		let complete = false;
		for (let i = 0; i < 100; i++) {
			if (
				(await trace(origin, run)).events.some(
					(event) => event.channel === 'answer' && event.type === 'complete',
				)
			) {
				complete = true;
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		assert.ok(complete, 'Answer producer must finish before activation');
		await documentResponse.finished();
		const receivedDocument = await documentResponse.text();
		const receivedFrames = (receivedDocument.match(/__octaneStreamedRenderer\.receive\(/g) ?? [])
			.length;
		assert.ok(receivedFrames > 0, 'The browser received stream frames before activation');
		const preActivationTrace = await trace(origin, run);
		assert.equal(
			preActivationTrace.events.filter(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'yield',
			).length,
			Number(settings.waves),
		);
		assert.equal(await page.locator('[data-answer]').getAttribute('data-revision'), '1');
		release();
		await page.waitForFunction(
			() => document.querySelector('[data-composer-ready="true"]') !== null,
		);
		await page.waitForFunction(
			() => document.querySelector('[data-draft-length]')?.textContent === '25',
		);
		const adopted = await page.evaluate(() => ({
			composer: window.__routeEvidence.composer === document.querySelector('#message'),
			message: window.__routeEvidence.message === document.querySelector('[data-message-id]'),
			value: document.querySelector('#message').value,
			focus: document.activeElement === document.querySelector('#message'),
			selection: [
				document.querySelector('#message').selectionStart,
				document.querySelector('#message').selectionEnd,
			],
		}));
		assert.deepEqual(adopted, {
			composer: true,
			message: true,
			value: 'Preserve this early draft',
			focus: true,
			selection: [3, 9],
		});
		assert.equal(await page.locator('[data-message-id]').count(), 2 * (Number(profile.turns) - 1));
		for (const name of ['Activate conversation', 'Activate history', 'Activate tools'])
			await page.getByRole('button', { name, exact: true }).click();
		for (const selector of ['[data-answer]', '[data-history]', '[data-tools]']) {
			await page.waitForFunction(
				(name) => document.querySelector(name)?.getAttribute('data-revision') === '4',
				selector,
			);
		}
		assert.equal(await page.locator('[data-history] li').count(), Number(profile.historyRows));
		const beforeSend = await trace(origin, run);
		for (const channel of ['answer', 'history', 'tools']) {
			assert.deepEqual(
				beforeSend.events
					.filter((event) => event.channel === channel && event.type === 'start')
					.map((event) => event.transport),
				['document'],
			);
		}
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
		assert.equal(await composer.inputValue(), '');
		assert.deepEqual(errors, []);
		return {
			adopted,
			activated: ['answer', 'history', 'tools'],
			initialStarts: 'one document producer each',
			receivedFramesBeforeActivation: receivedFrames,
			sentPrompt: 'Preserve this early draft',
			abortedRequests: errors.abortedRequests,
			errors,
		};
	} finally {
		release();
		await context.close();
	}
}
async function liveStreamBehavior(origin, profile) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const errors = diagnostics(page);
	const run = randomUUID();
	try {
		const url = new URL(urlFor(origin, 'deferred', run, profile));
		url.searchParams.set('interval', '1200');
		const documentResponse = await page.goto(url.href, { waitUntil: 'commit' });
		assert.ok(documentResponse);
		await page.locator('[data-answer]').waitFor();
		assert.equal(await page.locator('[data-answer]').getAttribute('data-revision'), '1');
		assert.ok(await page.locator('[data-message-id]').count());
		await page.evaluate(() => {
			window.__liveEvidence = {
				message: document.querySelector('[data-message-id]'),
				composer: document.querySelector('#message'),
			};
		});
		await page.getByRole('button', { name: 'Activate conversation', exact: true }).click();
		await page.waitForFunction(
			() => document.querySelector('[data-answer]')?.getAttribute('data-revision') === '2',
		);
		const during = (await trace(origin, run)).events.filter(
			(event) => event.channel === 'answer' && event.transport === 'document',
		);
		assert.ok(during.some((event) => event.type === 'yield' && event.revision === 2));
		assert.ok(
			!during.some((event) => event.type === 'complete'),
			'Live update arrived before the producer completed',
		);
		await page.waitForFunction(
			() => document.querySelector('[data-answer]')?.getAttribute('data-revision') === '4',
		);
		let after;
		for (let attempt = 0; attempt < 100; attempt++) {
			after = await trace(origin, run);
			if (
				after.events.some(
					(event) =>
						event.channel === 'answer' &&
						event.transport === 'document' &&
						event.type === 'finally',
				)
			)
				break;
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		assert.equal(
			after.events.filter(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'yield',
			).length,
			4,
		);
		assert.ok(
			after.events.some(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'complete',
			),
		);
		assert.ok(
			after.events.some(
				(event) =>
					event.channel === 'answer' && event.transport === 'document' && event.type === 'finally',
			),
		);
		const identity = await page.evaluate(() => ({
			message: window.__liveEvidence.message === document.querySelector('[data-message-id]'),
			composer: window.__liveEvidence.composer === document.querySelector('#message'),
		}));
		assert.deepEqual(identity, { message: true, composer: true });
		await documentResponse.finished();
		assert.deepEqual(errors, []);
		return {
			revisionDuringStream: 2,
			finalRevision: 4,
			producerCompleteAtRevision2: false,
			identity,
			abortedRequests: errors.abortedRequests,
			errors,
		};
	} finally {
		await context.close();
	}
}
async function configurationBehavior(origin) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const errors = diagnostics(page);
	try {
		await page.goto(urlFor(origin, 'deferred', randomUUID(), profiles.medium), {
			waitUntil: 'load',
		});
		await page.waitForLoadState('networkidle');
		const form = page.getByRole('region', { name: 'Run configuration', exact: true });
		await form.getByLabel(/^Stream snapshots/).fill('4');
		await form.getByLabel(/^Total turns/).fill('2');
		await form.getByLabel(/^History rows/).fill('5');
		await Promise.all([
			page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() }),
			form.getByRole('button', { name: 'Run deferred', exact: true }).click(),
		]);
		await page.waitForLoadState('load');
		const url = new URL(page.url());
		assert.equal(url.pathname, '/');
		assert.equal(url.searchParams.get('turns'), '2');
		assert.equal(url.searchParams.get('historyRows'), '5');
		await page.getByRole('button', { name: 'Activate history', exact: true }).click();
		await page.waitForFunction(
			() => document.querySelector('[data-history]')?.getAttribute('data-revision') === '4',
		);
		assert.equal(await page.locator('[data-history] li').count(), 5);
		assert.equal(await page.locator('[data-message-id]').count(), 2);
		assert.deepEqual(errors, []);
		return {
			turns: 2,
			historyRows: 5,
			formAction: url.pathname,
			finalHistoryRows: 5,
			abortedRequests: errors.abortedRequests,
			errors,
		};
	} finally {
		await context.close();
	}
}
async function failureBehavior(origin, profile) {
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const page = await context.newPage();
	const errors = diagnostics(page);
	const run = randomUUID();
	try {
		const url = new URL(urlFor(origin, 'failure', run, profile));
		url.pathname = '/eager';
		await page.goto(url.href, { waitUntil: 'load' });
		await page.getByText('Response failed', { exact: true }).waitFor();
		await page.getByRole('button', { name: 'Retry response', exact: true }).click();
		await page.waitForFunction(
			() => document.querySelector('[data-answer]')?.getAttribute('data-revision') === '4',
		);
		assert.equal(await page.getByText('Response failed', { exact: true }).count(), 0);
		assert.deepEqual(errors, []);
		const events = (await trace(origin, run)).events.filter(
			(event) => event.channel === 'answer' && event.type === 'start',
		);
		assert.deepEqual(
			events.map((event) => event.transport),
			['document', 'rpc'],
		);
		return {
			retry: true,
			answerStarts: events.map((event) => event.transport),
			abortedRequests: errors.abortedRequests,
			errors,
		};
	} finally {
		await context.close();
	}
}
try {
	const results = [];
	for (const variant of smoke ? ['baseline'] : ['baseline', 'control', 'fallback']) {
		const server = await startServer(variant);
		try {
			const http = {};
			const startup = [];
			for (const [profileName, profile] of Object.entries(
				smoke ? { medium: profiles.medium } : profiles,
			)) {
				http[profileName] = {};
				for (const scenario of ['deferred', 'eager', 'delayed', 'failure']) {
					http[profileName][scenario] = await httpSample(server.origin, scenario, profile);
					for (let index = 0; index < samples; index++)
						startup.push(await startupSample(server, variant, scenario, profileName, profile));
				}
			}
			const deferred = await deferredBehavior(server.origin, profiles.medium);
			const liveStream = await liveStreamBehavior(server.origin, profiles.medium);
			const failure = await failureBehavior(server.origin, profiles.medium);
			const configuration = await configurationBehavior(server.origin);
			assert.equal(server.logs(), '', `${variant}: server diagnostics`);
			results.push({
				variant,
				http,
				startup,
				behavior: { deferred, liveStream, failure, configuration },
			});
			process.stderr.write(`Completed ${variant}.\n`);
		} finally {
			if (server.child.exitCode === null && server.child.signalCode === null) {
				const exited = once(server.child, 'exit');
				server.child.kill();
				await exited;
			}
		}
	}
	const output = {
		sourceSha256: build.sourceSha256,
		toolchainSha256: build.toolchainSha256,
		buildReportSha256: digest(fs.readFileSync(path.join(directory, 'build-report.json'))),
		browser: browser.version(),
		node: process.version,
		settings,
		profiles,
		samples,
		smoke,
		results,
		limitations:
			'Fresh browser contexts and actual localhost requests. Chromium page-request sizes and Node-observed payload/header bytes are separate observations and can differ with transfer framing; neither includes physical-network overhead. HTML gzip-9 is an offline estimate. The idle checkpoint is a workload observation, not a paint or production-performance measurement.',
	};
	const file = path.join(directory, smoke ? 'browser-smoke.json' : 'browser-report.json');
	fs.writeFileSync(file, JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
	console.log(
		JSON.stringify(
			{
				file,
				browser: output.browser,
				variants: results.map((result) => ({
					variant: result.variant,
					startup: result.startup.map(
						({
							profile,
							scenario,
							responseBodyBytes,
							responseHeaderBytes,
							servedBodyBytes,
							servedHeaderBytes,
						}) => ({
							profile,
							scenario,
							responseBodyBytes,
							responseHeaderBytes,
							servedBodyBytes,
							servedHeaderBytes,
						}),
					),
					http: Object.fromEntries(
						Object.entries(result.http).map(([profile, scenarios]) => [
							profile,
							Object.fromEntries(
								Object.entries(scenarios).map(([name, item]) => [
									name,
									{
										bytes: item.bytes,
										gzip9Offline: item.gzip9Offline,
										streamScriptBytes: item.streamScriptBytes,
										signalReceiveCalls: item.signalReceiveCalls,
										pendingAnswer: item.pendingAnswer,
									},
								]),
							),
						]),
					),
				})),
			},
			null,
			2,
		),
	);
} finally {
	await browser.close();
}
