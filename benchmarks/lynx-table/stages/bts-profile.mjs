// Background-thread render attribution for create@N (#51 roadmap item 2).
//
// Attaches a CDP sampling profiler to the `lynx-bg` dedicated worker during
// the create operation and aggregates self time by function, symbolicating
// each hot frame with the surrounding production-bundle source (property
// names survive minification, so subsystems are recognizable). This is the
// owner-first gate for the background render diet: it says where the
// background CPU actually goes before any product change.
//
//   node stages/bts-profile.mjs [--reps 5] [--rows 10000] [--skip-build]
//
// The profiled realm is only the worker, so the page-side create pipeline is
// unaffected; wall clock is still recorded per sample for context.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

import { requireMinimumRepetitions } from './analyze.mjs';
import {
	WIRE_INSTRUMENT_JS,
	applyNeutralize,
	makeBenchHtml,
	stats,
} from '../web/driver-client.mjs';
import { buildTableApp } from '../scripts/build-app.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const { values: args } = parseArgs({
	options: {
		reps: { type: 'string', default: '5' },
		rows: { type: 'string', default: '10000' },
		port: { type: 'string', default: '8364' },
		top: { type: 'string', default: '30' },
		smoke: { type: 'boolean', default: false },
		'skip-build': { type: 'boolean', default: false },
		'allow-busy-host': { type: 'boolean', default: false },
	},
});
const repetitions = args.smoke ? 1 : requireMinimumRepetitions(args.reps);
const rows = Number(args.rows);
const topCount = Number(args.top);
const port = Number(args.port);
const cpuCount = os.cpus().length;
const loadPerCpu = os.loadavg()[0] / cpuCount;
if (!args['allow-busy-host'] && loadPerCpu > 0.5) {
	throw new Error(
		`quiet-host preflight failed: 1-minute load ${os.loadavg()[0].toFixed(2)} / ${cpuCount} CPUs = ${loadPerCpu.toFixed(2)}; close competing work or pass --allow-busy-host and disclose it.`,
	);
}

const createLabels = new Map([
	[1000, 'Create 1,000 rows'],
	[3000, 'Create 3,000 rows'],
	[5000, 'Create 5,000 rows'],
	[10000, 'Create 10,000 rows'],
	[20000, 'Create 20,000 rows'],
	[30000, 'Create 30,000 rows'],
]);
const createLabel = createLabels.get(rows);
if (createLabel === undefined)
	throw new Error(`the shared app has no create button for ${rows} rows.`);

const variants = { control: path.join(root, 'app/dist/main.web.bundle') };

const webCoreClientJs = require.resolve('@lynx-js/web-core/client.prod.js');
const webCoreRoot = path.resolve(path.dirname(webCoreClientJs), '../..');
const html = makeBenchHtml({ instrumentJs: WIRE_INSTRUMENT_JS });

function startServer() {
	const mime = {
		'.js': 'text/javascript',
		'.css': 'text/css',
		'.wasm': 'application/wasm',
		'.bundle': 'application/octet-stream',
	};
	const server = http.createServer((request, response) => {
		const url = new URL(request.url, 'http://localhost');
		if (url.pathname === '/') {
			response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
			response.end(html);
			return;
		}
		let file = null;
		if (url.pathname.startsWith('/webcore/')) file = path.join(webCoreRoot, url.pathname.slice(9));
		else if (url.pathname.startsWith('/bundle/')) file = variants[url.pathname.slice(8)];
		if (file === null || file === undefined || !fs.existsSync(file)) {
			response.writeHead(404);
			response.end('not found');
			return;
		}
		response.writeHead(200, {
			'content-type': mime[path.extname(file)] ?? 'application/octet-stream',
			'cache-control': 'no-store',
		});
		fs.createReadStream(file).pipe(response);
	});
	return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

function freePort() {
	return new Promise((resolve) => {
		const probe = net.createServer();
		probe.listen(0, '127.0.0.1', () => {
			const { port: value } = probe.address();
			probe.close(() => resolve(value));
		});
	});
}

// -- flat CDP client (same shape as the shared cross-framework runner) -------
class CdpClient {
	#ws;
	#nextId = 1;
	#pending = new Map();
	#eventHandlers = [];

	static async connect(cdpPort) {
		const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
		const { webSocketDebuggerUrl } = await response.json();
		const client = new CdpClient();
		await client.#open(webSocketDebuggerUrl);
		return client;
	}

	#open(url) {
		return new Promise((resolve, reject) => {
			this.#ws = new WebSocket(url);
			this.#ws.addEventListener('open', () => resolve());
			this.#ws.addEventListener('error', (event) =>
				reject(new Error(`CDP connect failed: ${event.message ?? event}`)),
			);
			this.#ws.addEventListener('message', (event) => this.#onMessage(String(event.data)));
		});
	}

	#onMessage(raw) {
		const message = JSON.parse(raw);
		if (message.id != null && this.#pending.has(message.id)) {
			const { resolve, reject } = this.#pending.get(message.id);
			this.#pending.delete(message.id);
			if (message.error) reject(new Error(`CDP ${message.error.message}`));
			else resolve(message.result);
		} else if (message.method) {
			for (const handler of this.#eventHandlers)
				handler(message.method, message.params ?? {}, message.sessionId);
		}
	}

	send(method, params = {}, sessionId = undefined) {
		const id = this.#nextId++;
		return new Promise((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
			this.#ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
		});
	}

	onEvent(handler) {
		this.#eventHandlers.push(handler);
	}

	close() {
		try {
			this.#ws.close();
		} catch {
			/* already closed */
		}
	}
}

async function attachBackgroundWorker(client, urlPrefix) {
	const { targetInfos } = await client.send('Target.getTargets');
	const page = targetInfos.find(
		(target) => target.type === 'page' && target.url.startsWith(urlPrefix),
	);
	if (!page) throw new Error(`no page target matching ${urlPrefix}`);
	const { sessionId: pageSession } = await client.send('Target.attachToTarget', {
		targetId: page.targetId,
		flatten: true,
	});
	attachBackgroundWorker.lastPageSession = pageSession;
	const workers = new Map();
	client.onEvent((method, params, sessionId) => {
		if (method === 'Target.attachedToTarget' && sessionId === pageSession) {
			const info = params.targetInfo;
			if (info.type === 'worker') {
				workers.set(info.targetId, { sessionId: params.sessionId, url: info.url });
			}
		}
	});
	await client.send(
		'Target.setAutoAttach',
		{ autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
		pageSession,
	);
	// web-core spawns several workers (template loader, background thread). The
	// background realm is the one that is not the template loader; wait until
	// it appears rather than taking the first attachment.
	const isBackground = (entry) => !/template-loader/.test(entry.url);
	const deadline = Date.now() + 30000;
	for (;;) {
		const match = [...workers.values()].find(isBackground);
		if (match !== undefined) {
			if (process.env.LYNX_BENCH_DEBUG) {
				console.log(
					'[bts-profile:debug] workers:',
					JSON.stringify([...workers.values()].map((entry) => entry.url)),
				);
			}
			return match;
		}
		if (Date.now() > deadline) {
			throw new Error(
				`background worker never attached; saw: ${[...workers.values()].map((entry) => entry.url).join(', ') || 'none'}`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

async function loadPage(browser) {
	const page = await browser.newPage();
	await applyNeutralize(page);
	await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
	await page.evaluate(
		(url) => globalThis.__x.createView(url),
		`http://127.0.0.1:${port}/bundle/control`,
	);
	await page.waitForFunction(() => globalThis.__x.findText('Benchmark on Lynx'), undefined, {
		timeout: 60000,
	});
	await page.evaluate(() => globalThis.__x.settle());
	return page;
}

async function clickAndAwait(page, label, predicate) {
	const armed = page.evaluate((spec) => globalThis.__x.arm(spec, 120000), predicate);
	const rectangle = await page.evaluate((text) => globalThis.__x.buttonRect(text), label);
	if (rectangle === null) throw new Error(`${label} button not found.`);
	await page.mouse.click(rectangle.x, rectangle.y);
	return (await armed).ms;
}

function busyMs(profile) {
	const idleById = new Map(
		profile.nodes.map((node) => {
			const name = node.callFrame?.functionName ?? '';
			return [node.id, name === '(idle)' || name === '(program)' || name === '(root)'];
		}),
	);
	let micros = 0;
	const { samples: sampleIds, timeDeltas } = profile;
	for (let index = 0; index < (sampleIds?.length ?? 0); index++) {
		const delta = timeDeltas[index] ?? 0;
		if (delta > 0 && idleById.get(sampleIds[index]) === false) micros += delta;
	}
	return micros / 1000;
}

async function timedCreate(page, client, sessions, tag = '') {
	const wireBefore = await page.evaluate(() => globalThis.__OCTANE_STAGE_WIRE__());
	await client.send('Profiler.start', {}, sessions.worker.sessionId);
	await client.send('Profiler.start', {}, sessions.pageSession);
	const wallMs = await clickAndAwait(page, createLabel, { type: 'rowCount', value: rows });
	const { profile } = await client.send('Profiler.stop', {}, sessions.worker.sessionId);
	const { profile: pageProfile } = await client.send('Profiler.stop', {}, sessions.pageSession);
	const wireAfter = await page.evaluate(() => globalThis.__OCTANE_STAGE_WIRE__());
	const wire = {
		toBts: {
			bytes: wireAfter.toBts.bytes - wireBefore.toBts.bytes,
			messages: wireAfter.toBts.messages - wireBefore.toBts.messages,
			byName: Object.fromEntries(
				Object.entries(wireAfter.toBts.byName)
					.map(([name, value]) => [
						name,
						{
							bytes: value.bytes - (wireBefore.toBts.byName[name]?.bytes ?? 0),
							messages: value.messages - (wireBefore.toBts.byName[name]?.messages ?? 0),
						},
					])
					.filter(([, value]) => value.bytes !== 0 || value.messages !== 0),
			),
		},
		toMts: {
			bytes: wireAfter.toMts.bytes - wireBefore.toMts.bytes,
			messages: wireAfter.toMts.messages - wireBefore.toMts.messages,
		},
	};
	if (process.env.LYNX_BENCH_DEBUG) {
		console.log(
			`[bts-profile:rep] ${tag} wall=${wallMs.toFixed(1)} btsSelf=${busyMs(profile).toFixed(1)} mtsSelf=${busyMs(pageProfile).toFixed(1)} toBts=${wire.toBts.bytes}B/${wire.toBts.messages}m toMts=${wire.toMts.bytes}B/${wire.toMts.messages}m byName=${JSON.stringify(wire.toBts.byName)}`,
		);
	}
	return { wallMs, profile, pageProfile, wire };
}

async function attachProfiler(client) {
	const worker = await attachBackgroundWorker(client, `http://127.0.0.1:${port}/`);
	await client.send('Profiler.enable', {}, worker.sessionId);
	await client.send('Profiler.setSamplingInterval', { interval: 100 }, worker.sessionId);
	const pageSession = attachBackgroundWorker.lastPageSession;
	await client.send('Profiler.enable', {}, pageSession);
	await client.send('Profiler.setSamplingInterval', { interval: 100 }, pageSession);
	return { worker, pageSession };
}

async function runSample(browser, cdpPort) {
	const page = await loadPage(browser);
	const client = await CdpClient.connect(cdpPort);
	try {
		const sessions = await attachProfiler(client);
		const { wallMs, profile, pageProfile } = await timedCreate(page, client, sessions, 'fresh');
		return { wallMs, profile, pageProfile };
	} finally {
		client.close();
		await page.close();
	}
}

// Featured-harness replica: one page, two 1k create/clear warmup cycles, then
// per rep clear -> gc(page realm) -> timed create@rows. Accumulated background
// state and garbage stay live across reps exactly as in the public runner.
async function runWarmedSamples(browser, cdpPort, count) {
	const page = await loadPage(browser);
	const client = await CdpClient.connect(cdpPort);
	const out = [];
	try {
		const sessions = await attachProfiler(client);
		for (let cycle = 0; cycle < 2; cycle++) {
			await clickAndAwait(page, 'Create 1,000 rows', { type: 'rowCount', value: 1000 });
			await clickAndAwait(page, 'Clear', { type: 'rowCount', value: 0 });
		}
		await page.evaluate(() => globalThis.__x.settle());
		for (let rep = 0; rep < count; rep++) {
			const rowCount = await page.evaluate(() => globalThis.__x.rowCount());
			if (rowCount > 0) {
				await clickAndAwait(page, 'Clear', { type: 'rowCount', value: 0 });
			}
			await page.evaluate(() => (typeof gc === 'function' ? gc() : undefined)).catch(() => {});
			await page.evaluate(() => globalThis.__x.settle());
			out.push(await timedCreate(page, client, sessions, `warmed#${rep}`));
		}
		return out;
	} finally {
		client.close();
		await page.close();
	}
}

// -- aggregation -------------------------------------------------------------
function aggregate(samples, key = 'profile') {
	// Same estimator as the shared cross-framework runner's profileCpuMs:
	// walk samples/timeDeltas, attribute each delta to its sample's node, and
	// treat (idle)/(program)/(root) as idle. Numbers are therefore directly
	// comparable with the public btsCpu records.
	const perFunction = new Map();
	let totalSelfMicros = 0;
	for (const sample of samples) {
		const profile = sample[key];
		if (profile === undefined) continue;
		const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
		const { samples: sampleIds, timeDeltas } = profile;
		if (!sampleIds?.length) continue;
		for (let index = 0; index < sampleIds.length; index++) {
			const node = nodesById.get(sampleIds[index]);
			if (node === undefined) continue;
			const frame = node.callFrame;
			const name = frame.functionName ?? '';
			if (name === '(idle)' || name === '(program)' || name === '(root)') continue;
			const delta = timeDeltas[index] ?? 0;
			if (delta <= 0) continue;
			totalSelfMicros += delta;
			const key = `${name}@${frame.url}:${frame.lineNumber}:${frame.columnNumber}`;
			const entry = perFunction.get(key) ?? {
				functionName: name || '(anonymous)',
				url: frame.url,
				line: frame.lineNumber,
				column: frame.columnNumber,
				selfMicros: 0,
				hits: 0,
			};
			entry.selfMicros += delta;
			entry.hits += 1;
			perFunction.set(key, entry);
		}
	}
	return {
		totalSelfMs: totalSelfMicros / 1000,
		functions: [...perFunction.values()].sort((a, b) => b.selfMicros - a.selfMicros),
	};
}

const bundleTextCache = new Map();
function snippetFor(entry) {
	// The worker script is a Blob of the bundle's background chunk; the frame
	// URL is blob:, so symbolicate against the shipped background chunk text.
	if (!entry.url.startsWith('blob:')) return null;
	const bundle = fs.readFileSync(variants.control, 'utf-8');
	let text = bundleTextCache.get('control');
	if (text === undefined) {
		text = bundle;
		bundleTextCache.set('control', text);
	}
	const lines = text.split('\n');
	// The background chunk is embedded as one long line inside the bundle; the
	// worker's line numbers refer to the Blob content, which serializes the
	// chunk verbatim. Find the background chunk line, then index into it.
	const chunkLine = lines.find((line) => line.includes('.rspeedy/main/background.'));
	const source = chunkLine ?? text;
	const sourceLines = source.split('\n');
	const line = sourceLines[entry.line] ?? source;
	const start = Math.max(0, entry.column - 40);
	return line.slice(start, entry.column + 120).replace(/\s+/g, ' ');
}

if (!args['skip-build']) {
	const previousRows = process.env.BENCH_AUTOROWS;
	const previousProfile = process.env.OCTANE_LYNX_PROFILE;
	try {
		process.env.BENCH_AUTOROWS = '0';
		process.env.OCTANE_LYNX_PROFILE = '0';
		buildTableApp({ silent: true });
	} finally {
		if (previousRows === undefined) delete process.env.BENCH_AUTOROWS;
		else process.env.BENCH_AUTOROWS = previousRows;
		if (previousProfile === undefined) delete process.env.OCTANE_LYNX_PROFILE;
		else process.env.OCTANE_LYNX_PROFILE = previousProfile;
	}
}
for (const [name, file] of Object.entries(variants)) {
	if (!fs.existsSync(file)) throw new Error(`${name} bundle is missing: ${file}`);
}

const server = await startServer();
const { chromium } = require('playwright');
const cdpPort = await freePort();
const browser = await chromium.launch({
	headless: true,
	...(process.env.PLAYWRIGHT_CHROMIUM_PATH
		? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
		: null),
	args: [
		`--remote-debugging-port=${cdpPort}`,
		'--js-flags=--expose-gc',
		'--disable-background-timer-throttling',
		'--disable-renderer-backgrounding',
	],
});
const loadStart = os.loadavg();
const samples = [];
let warmedSamples = [];
try {
	for (let index = 0; index < repetitions; index++) {
		samples.push(await runSample(browser, cdpPort));
	}
	warmedSamples = await runWarmedSamples(browser, cdpPort, repetitions);
} finally {
	await browser.close();
	server.close();
}
const loadEnd = os.loadavg();

const walls = stats(samples.map((sample) => sample.wallMs));
const { totalSelfMs, functions } = aggregate(samples);
const perSampleSelfMs = totalSelfMs / samples.length;
const warmedWalls = stats(warmedSamples.map((sample) => sample.wallMs));
const warmedAggregate = warmedSamples.length > 0 ? aggregate(warmedSamples) : null;
const warmedSelfMs =
	warmedAggregate === null ? null : warmedAggregate.totalSelfMs / warmedSamples.length;
const freshPageAggregate = aggregate(samples, 'pageProfile');
const warmedPageAggregate =
	warmedSamples.length > 0 ? aggregate(warmedSamples, 'pageProfile') : null;

const report = {
	meta: {
		date: new Date().toISOString(),
		rows,
		repetitions,
		samplingIntervalMicros: 100,
		cpus: os.cpus().length,
		cpuModel: os.cpus()[0]?.model ?? 'unknown',
		platform: os.platform(),
		release: os.release(),
		node: process.version,
		loadStart,
		loadEnd,
		protocol:
			'fresh page per sample; CDP sampling profiler attached to the lynx-bg worker only; wall is pointerdown to composed rowCount predicate',
	},
	fresh: { wallMs: walls, backgroundSelfMsPerSample: perSampleSelfMs },
	warmed: { wallMs: warmedWalls, backgroundSelfMsPerSample: warmedSelfMs },
	top: topOf(functions, totalSelfMs, samples.length),
	warmedTop:
		warmedAggregate === null
			? []
			: topOf(warmedAggregate.functions, warmedAggregate.totalSelfMs, warmedSamples.length),
	pageTop: topOf(freshPageAggregate.functions, freshPageAggregate.totalSelfMs, samples.length),
	warmedPageTop:
		warmedPageAggregate === null
			? []
			: topOf(warmedPageAggregate.functions, warmedPageAggregate.totalSelfMs, warmedSamples.length),
	pageSelfMsPerSample: freshPageAggregate.totalSelfMs / samples.length,
	warmedPageSelfMsPerSample:
		warmedPageAggregate === null ? null : warmedPageAggregate.totalSelfMs / warmedSamples.length,
};

function topOf(list, totalMs, sampleCount) {
	return list.slice(0, topCount).map((entry) => ({
		functionName: entry.functionName,
		selfMsPerSample: entry.selfMicros / 1000 / sampleCount,
		share: entry.selfMicros / 1000 / totalMs,
		hits: entry.hits,
		line: entry.line,
		column: entry.column,
		snippet: snippetFor(entry),
	}));
}

const resultsDir = path.join(root, 'stages/results');
fs.mkdirSync(resultsDir, { recursive: true });
const jsonPath = path.join(resultsDir, `bts-profile-${rows}.json`);
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, '\t')}\n`);

const lines = [
	`# Background render attribution @ ${rows.toLocaleString('en-US')} rows`,
	'',
	`- measured: ${report.meta.date}`,
	`- host: ${report.meta.cpus}× ${report.meta.cpuModel}; ${report.meta.platform} ${report.meta.release}; Node ${report.meta.node}`,
	`- protocol: ${report.meta.protocol}`,
	`- host load: start ${loadStart.map((v) => v.toFixed(2)).join('/')} (1/5/15m), end ${loadEnd.map((v) => v.toFixed(2)).join('/')}`,
	`- repetitions: n=${repetitions}; sampling interval ${report.meta.samplingIntervalMicros} µs`,
	'',
	'## Fresh page (first create after boot)',
	'',
	`Create wall: median ${walls?.median?.toFixed(1)} ms. Background self time: ${perSampleSelfMs.toFixed(1)} ms/sample.`,
	'',
	`| # | self ms/sample | share | function | snippet |`,
	'|---:|---:|---:|---|---|',
];
report.top.forEach((entry, index) => {
	lines.push(
		`| ${index + 1} | ${entry.selfMsPerSample.toFixed(1)} | ${(entry.share * 100).toFixed(1)}% | \`${entry.functionName}\` | \`${(entry.snippet ?? '').slice(0, 100).replaceAll('|', '\\|')}\` |`,
	);
});
lines.push(
	'',
	'## Warmed page (featured-harness replica: 2×1k create/clear warmup, then per rep clear → gc(page) → timed create)',
	'',
	`Create wall: median ${warmedWalls?.median?.toFixed(1)} ms. Background self time: ${warmedSelfMs?.toFixed(1)} ms/sample.`,
	'',
	`| # | self ms/sample | share | function | snippet |`,
	'|---:|---:|---:|---|---|',
);
report.warmedTop.forEach((entry, index) => {
	lines.push(
		`| ${index + 1} | ${entry.selfMsPerSample.toFixed(1)} | ${(entry.share * 100).toFixed(1)}% | \`${entry.functionName}\` | \`${(entry.snippet ?? '').slice(0, 100).replaceAll('|', '\\|')}\` |`,
	);
});
const pageSection = (title, selfMs, top) => {
	lines.push(
		'',
		title,
		'',
		`Page-realm self time: ${selfMs?.toFixed(1)} ms/sample.`,
		'',
		'| # | self ms/sample | share | function | snippet |',
		'|---:|---:|---:|---|---|',
	);
	top.forEach((entry, index) => {
		lines.push(
			`| ${index + 1} | ${entry.selfMsPerSample.toFixed(1)} | ${(entry.share * 100).toFixed(1)}% | \`${entry.functionName}\` | \`${(entry.snippet ?? '').slice(0, 100).replaceAll('|', '\\|')}\` |`,
		);
	});
};
pageSection('## Page realm (MTS + harness), fresh', report.pageSelfMsPerSample, report.pageTop);
pageSection(
	'## Page realm (MTS + harness), warmed',
	report.warmedPageSelfMsPerSample,
	report.warmedPageTop,
);
lines.push('');
const mdPath = path.join(resultsDir, `bts-profile-${rows}.md`);
fs.writeFileSync(mdPath, lines.join('\n'));
console.log(`[bts-profile] ${jsonPath}`);
console.log(`[bts-profile] ${mdPath}`);
console.log(lines.join('\n'));
