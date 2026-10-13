// Production app-frame hydration in headless Chromium.
//
// Builds the frame in src/ with the Octane Vite plugin (every module imports
// octane/signals, so native reads, runtime style bindings and the document
// signal owner are all active), server-renders it in Node, then hydrates the
// HTML on fresh pages under CPU throttling. Optional `--base=<checkout>` builds
// the same fixture against another checkout's runtime and compiler and
// interleaves its samples with this checkout's in every round, reporting the
// paired head/base ratio with a bootstrap 95% interval.
//
// `frame-plain` builds the same frame with no octane/signals import anywhere
// (see plainTwin), so its paired ratio against `frame` tracks what native
// reads cost a frame that barely reads a signal.
//
//   node benchmarks/app-frame-hydration/run.mjs [rounds] [--base=<checkout>]
//        [--throttle=4] [--warm-reps=<n>]
//        [--scenarios=frame,frame-live-sections,frame-plain]
process.env.NODE_ENV = 'production';

import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { roundOrder } from '../lib/paired.mjs';
import { pairedRatio, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const rootRequire = createRequire(path.join(REPO, 'package.json'));
const newsRequire = createRequire(path.join(REPO, 'benchmarks/news/package.json'));

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const flags = new Map(
	process.argv
		.slice(2)
		.filter((arg) => arg.startsWith('--'))
		.map((arg) => {
			const [key, value = 'true'] = arg.slice(2).split('=');
			return [key, value];
		}),
);
const rounds = Number.parseInt(positional[0] ?? '20', 10);
const throttle = Number(flags.get('throttle') ?? '4');
const warmReps = Number.parseInt(flags.get('warm-reps') ?? '1', 10);
const scenarios = (flags.get('scenarios') ?? 'frame,frame-live-sections,frame-plain').split(',');
const baseCheckout = flags.has('base') ? path.resolve(flags.get('base')) : null;
const WARMUPS = 4;

if (!Number.isSafeInteger(rounds) || rounds < 1)
	throw new Error('rounds must be a positive integer');
if (!(throttle >= 1)) throw new Error('--throttle must be at least 1');

/** Map every string `octane/*` export of a checkout to that checkout's source. */
function octaneAliases(checkout) {
	const packageDir = path.join(checkout, 'packages/octane');
	const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
	const aliases = [];
	for (const [key, target] of Object.entries(manifest.exports)) {
		const file = typeof target === 'string' ? target : target.default;
		if (typeof file !== 'string' || !/\.[cm]?[jt]s$/.test(file)) continue;
		const specifier = key === '.' ? 'octane' : `octane/${key.slice(2)}`;
		const escaped = specifier.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
		aliases.push({ find: new RegExp(`^${escaped}$`), replacement: path.join(packageDir, file) });
	}
	return aliases;
}

const SRC = path.join(HERE, 'src');
const PLAIN = path.join(SRC, 'plain');
const SEED_SCRIPT = /<script type="application\/json" data-octane-native-signals>.*?<\/script>/s;

/** A `-plain` scenario renders its fixture scenario with the plain twin. */
function fixtureOf(scenario) {
	return scenario.endsWith('-plain')
		? { variant: 'plain', fixtureScenario: scenario.slice(0, -'-plain'.length) }
		: { variant: 'signals', fixtureScenario: scenario };
}

/**
 * The plain twin builds the same frame with no module naming octane/signals,
 * so nothing compiles with native reads or signal bindings: plain/store.ts
 * stands in for the signals entry, and a frame module that reads a signal
 * resolves to its plain/ copy, which reads the store through
 * useSyncExternalStore instead.
 */
function plainTwin() {
	const store = JSON.stringify(path.join(PLAIN, 'store.ts'));
	return {
		name: 'app-frame-plain-twin',
		enforce: 'pre',
		resolveId(source, importer) {
			if (importer === undefined || path.dirname(importer) !== SRC || !source.startsWith('./'))
				return null;
			const twin = path.join(PLAIN, source);
			return fs.existsSync(twin) ? twin : null;
		},
		transform(code, id) {
			return id.startsWith(SRC) ? code.replaceAll("'octane/signals'", store) : null;
		},
	};
}

async function buildCandidate(name, checkout, outDir) {
	const { build } = await import(pathToFileURL(newsRequire.resolve('vite')).href);
	const { octane } = await import(
		pathToFileURL(path.join(checkout, 'packages/octane/src/compiler/vite.js')).href
	);
	const alias = octaneAliases(checkout);
	const common = {
		root: HERE,
		configFile: false,
		logLevel: 'warn',
		resolve: { alias },
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	};
	const clients = new Map();
	const html = new Map();
	for (const variant of new Set(scenarios.map((scenario) => fixtureOf(scenario).variant))) {
		const variantDir = path.join(outDir, variant);
		const twin = variant === 'plain' ? [plainTwin()] : [];
		// The timed client is minified like a shipped app. The counter client keeps
		// function names so Chromium's precise coverage can attribute calls.
		for (const minify of [true, false]) {
			await build({
				...common,
				plugins: [...twin, octane({ ssr: false })],
				build: {
					lib: {
						entry: path.join(SRC, 'client.ts'),
						formats: ['iife'],
						name: 'AppFrameHydration',
						fileName: () => (minify ? 'client.js' : 'client.debug.js'),
					},
					outDir: path.join(variantDir, 'client'),
					emptyOutDir: false,
					minify: minify ? 'esbuild' : false,
					target: 'es2022',
				},
			});
		}
		await build({
			...common,
			plugins: [...twin, octane({ ssr: true })],
			ssr: { noExternal: true },
			build: {
				ssr: path.join(SRC, 'server.ts'),
				rollupOptions: { output: { entryFileNames: 'server.mjs' } },
				outDir: path.join(variantDir, 'server'),
				emptyOutDir: false,
				minify: false,
				target: 'node22',
			},
		});
		const server = await import(pathToFileURL(path.join(variantDir, 'server/server.mjs')).href);
		for (const scenario of scenarios) {
			const fixture = fixtureOf(scenario);
			if (fixture.variant === variant)
				html.set(scenario, server.renderFrame(fixture.fixtureScenario));
		}
		clients.set(variant, {
			client: fs.readFileSync(path.join(variantDir, 'client/client.js'), 'utf8'),
			debugClient: fs.readFileSync(path.join(variantDir, 'client/client.debug.js'), 'utf8'),
		});
	}
	// The twin must render the signals frame exactly, less its native seed script.
	for (const scenario of scenarios) {
		const plain = html.get(`${scenario}-plain`);
		if (plain !== undefined && html.get(scenario).replace(SEED_SCRIPT, '') !== plain)
			throw new Error(`${name}: ${scenario}-plain no longer renders ${scenario}'s server HTML`);
	}
	return { name, checkout, html, clients };
}

function servePages(candidates) {
	const routes = new Map();
	for (const candidate of candidates) {
		for (const [variant, { client, debugClient }] of candidate.clients) {
			routes.set(`/${candidate.name}/${variant}/client.js`, client);
			routes.set(`/${candidate.name}/${variant}/client.debug.js`, debugClient);
		}
		for (const [scenario, html] of candidate.html) {
			const { variant } = fixtureOf(scenario);
			for (const [suffix, script] of [
				['', 'client.js'],
				['/debug', 'client.debug.js'],
			]) {
				routes.set(
					`/${candidate.name}/${scenario}${suffix}`,
					'<!doctype html><html><head><meta charset="utf-8"><title>frame</title></head>' +
						`<body><div id="app">${html}</div>` +
						`<script src="/${candidate.name}/${variant}/${script}"></script></body></html>`,
				);
			}
		}
	}
	const server = http.createServer((request, response) => {
		const body = routes.get(request.url);
		if (body === undefined) {
			response.statusCode = 404;
			response.end();
			return;
		}
		response.setHeader(
			'content-type',
			request.url.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8',
		);
		response.setHeader('cache-control', 'no-store');
		response.end(body);
	});
	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () =>
			resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }),
		);
	});
}

function assertVerified(label, outcome) {
	if (
		outcome.replaced !== 0 ||
		outcome.recoverableErrors !== 0 ||
		!outcome.interactionHandled ||
		!outcome.unmountClean
	) {
		throw new Error(`${label} failed verification: ${JSON.stringify(outcome)}`);
	}
}

async function openPage(browser, url) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	const cdp = await context.newCDPSession(page);
	return { context, page, cdp, errors, url };
}

async function loadPage(session) {
	await session.page.goto(session.url, { waitUntil: 'load' });
	const loaded = await session.page.evaluate(
		() => typeof window.AppFrameHydration?.hydrateFrame === 'function',
	);
	if (!loaded) throw new Error(`${session.url} did not load the production client`);
	await session.page.evaluate(() => {
		window.__frameHtml = document.getElementById('app').innerHTML;
	});
}

async function prepare(session, scenario) {
	await session.page.evaluate(
		(name) => window.AppFrameHydration.prepareFrame(document.getElementById('app'), name),
		fixtureOf(scenario).fixtureScenario,
	);
}

async function hydrateOnce(session, scenario) {
	await prepare(session, scenario);
	await session.page.evaluate(() => globalThis.gc?.());
	const durationMs = await session.page.evaluate(() => window.AppFrameHydration.hydrateFrame());
	const outcome = await session.page.evaluate(() => window.AppFrameHydration.verifyFrame());
	assertVerified(session.url, outcome);
	if (session.errors.length !== 0) throw new Error(session.errors.join('\n'));
	return { durationMs, elements: outcome.elements };
}

async function resetFrame(session) {
	await session.page.evaluate(() => {
		document.getElementById('app').innerHTML = window.__frameHtml;
	});
}

/** One cold hydration: a fresh browser context, so no JIT state or feedback survives. */
async function coldSample(browser, origin, candidate, scenario) {
	const session = await openPage(browser, `${origin}/${candidate.name}/${scenario}`);
	try {
		await session.cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
		await loadPage(session);
		return await hydrateOnce(session, scenario);
	} finally {
		await session.context.close();
	}
}

const COUNTED = [
	'renderBlock',
	'renderBlockInner',
	'BlockImpl',
	'scopeSignalOwner',
	'runWithSignalOwner',
	'associateSignalOwnerDocument',
];

/**
 * Deterministic work for one cold hydration in a jitless browser: named
 * production calls from precise coverage, and the JS heap bytes allocated by
 * hydration with a young generation large enough that no scavenge runs inside.
 */
async function countWork(browser, origin, candidate, scenario) {
	const session = await openPage(browser, `${origin}/${candidate.name}/${scenario}/debug`);
	try {
		await session.cdp.send('Profiler.enable');
		await session.cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
		await loadPage(session);
		await prepare(session, scenario);
		await session.cdp.send('Profiler.takePreciseCoverage');
		await session.page.evaluate(() => window.AppFrameHydration.hydrateFrame());
		const coverage = await session.cdp.send('Profiler.takePreciseCoverage');
		await session.page.evaluate(() => window.AppFrameHydration.verifyFrame());
		await session.cdp.send('Profiler.stopPreciseCoverage');
		const counts = Object.fromEntries(COUNTED.map((name) => [name, 0]));
		let calls = 0;
		for (const script of coverage.result) {
			if (!script.url.endsWith('/client.debug.js')) continue;
			for (const fn of script.functions) {
				const count = fn.ranges[0]?.count ?? 0;
				calls += count;
				if (Object.hasOwn(counts, fn.functionName)) counts[fn.functionName] += count;
			}
		}
		if (counts.renderBlockInner === 0) throw new Error('coverage observed no block renders');

		await resetFrame(session);
		await prepare(session, scenario);
		await session.page.evaluate(() => globalThis.gc());
		const before = await session.cdp.send('Runtime.getHeapUsage');
		await session.page.evaluate(() => window.AppFrameHydration.hydrateFrame());
		const after = await session.cdp.send('Runtime.getHeapUsage');
		assertVerified(
			session.url,
			await session.page.evaluate(() => window.AppFrameHydration.verifyFrame()),
		);
		if (session.errors.length !== 0) throw new Error(session.errors.join('\n'));
		return { calls, ...counts, heapBytes: after.usedSize - before.usedSize };
	} finally {
		await session.context.close();
	}
}

function errorText(error) {
	return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-app-frame-hydration-'));
const rows = [];
const comparisons = [];
let failure;
let browser;
let counterBrowser;
let pages;

try {
	const candidates = [await buildCandidate('head', REPO, path.join(outRoot, 'head'))];
	if (baseCheckout !== null)
		candidates.unshift(await buildCandidate('base', baseCheckout, path.join(outRoot, 'base')));
	const playwright = await import(pathToFileURL(rootRequire.resolve('playwright')).href);
	const { chromium } = playwright.default ?? playwright;
	pages = await servePages(candidates);
	browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--no-sandbox', '--js-flags=--expose-gc'],
	});
	counterBrowser = await chromium.launch({
		headless: true,
		args: [
			'--disable-extensions',
			'--no-sandbox',
			'--js-flags=--expose-gc --jitless --min-semi-space-size=128 --max-semi-space-size=128',
		],
	});

	const cold = new Map();
	const warm = new Map();
	const key = (candidate, scenario) => `${candidate.name}/${scenario}`;
	for (const candidate of candidates) {
		for (const scenario of scenarios) {
			cold.set(key(candidate, scenario), []);
			warm.set(key(candidate, scenario), []);
		}
	}

	// Warm pages stay open for the whole run: each measures repeated hydrations
	// of the same server HTML after its own warmups.
	const warmPages = new Map();
	for (const candidate of candidates) {
		for (const scenario of scenarios) {
			const session = await openPage(browser, `${pages.origin}/${candidate.name}/${scenario}`);
			await session.cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
			await loadPage(session);
			for (let warmup = 0; warmup < WARMUPS; warmup++) {
				await hydrateOnce(session, scenario);
				await resetFrame(session);
			}
			warmPages.set(key(candidate, scenario), session);
		}
	}
	// One discarded cold sample per pair primes the browser's process pool.
	for (const candidate of candidates)
		for (const scenario of scenarios) await coldSample(browser, pages.origin, candidate, scenario);

	const elements = new Map();
	for (let round = 0; round < rounds; round++) {
		for (const scenario of roundOrder(scenarios, round)) {
			for (const candidate of roundOrder(candidates, round)) {
				const sample = await coldSample(browser, pages.origin, candidate, scenario);
				cold.get(key(candidate, scenario)).push(sample.durationMs);
				elements.set(key(candidate, scenario), sample.elements);
				const session = warmPages.get(key(candidate, scenario));
				let total = 0;
				for (let rep = 0; rep < warmReps; rep++) {
					total += (await hydrateOnce(session, scenario)).durationMs;
					await resetFrame(session);
				}
				warm.get(key(candidate, scenario)).push(total / warmReps);
			}
		}
	}
	for (const session of warmPages.values()) await session.context.close();

	for (const scenario of scenarios) {
		for (const candidate of candidates) {
			const work = await countWork(counterBrowser, pages.origin, candidate, scenario);
			const { client } = candidate.clients.get(fixtureOf(scenario).variant);
			const coldStat = summarizeSamples(cold.get(key(candidate, scenario)));
			const warmStat = summarizeSamples(warm.get(key(candidate, scenario)));
			rows.push({
				name: candidates.length === 1 ? scenario : `${scenario}@${candidate.name}`,
				ops: {
					hydrate_cold: timingStatForJson(coldStat),
					hydrate_warm: timingStatForJson(warmStat),
				},
				meta: {
					correctness: 'pass',
					browser: 'chromium',
					browserVersion: browser.version(),
					cpuThrottle: throttle,
					elements: elements.get(key(candidate, scenario)),
					blocks: work.BlockImpl,
					blockRenders: work.renderBlockInner,
					renderBlockEntries: work.renderBlock,
					renderBlockEntriesPerRender: Number(
						(work.renderBlock / work.renderBlockInner).toFixed(3),
					),
					scopeSignalOwnerCalls: work.scopeSignalOwner,
					runWithSignalOwnerCalls: work.runWithSignalOwner,
					associateSignalOwnerDocumentCalls: work.associateSignalOwnerDocument,
					productionCalls: work.calls,
					heapBytes: work.heapBytes,
					serverHtmlBytes: candidate.html.get(scenario).length,
					clientBytes: client.length,
					clientGzipBytes: gzipSync(client).length,
				},
			});
		}
		if (candidates.length === 2) {
			const [base, head] = candidates;
			for (const op of ['cold', 'warm']) {
				const samples = op === 'cold' ? cold : warm;
				comparisons.push({
					scenario,
					op: `hydrate_${op}`,
					of: 'head/base',
					serverHtmlIdentical: base.html.get(scenario) === head.html.get(scenario),
					...pairedRatio(samples.get(key(base, scenario)), samples.get(key(head, scenario))),
				});
			}
		}
	}

	// What native reads cost: each candidate's signals frame over its plain twin,
	// sampled in the same rounds.
	for (const scenario of scenarios) {
		if (!scenarios.includes(`${scenario}-plain`)) continue;
		for (const candidate of candidates) {
			for (const op of ['cold', 'warm']) {
				const samples = op === 'cold' ? cold : warm;
				comparisons.push({
					scenario: candidates.length === 1 ? scenario : `${scenario}@${candidate.name}`,
					op: `hydrate_${op}`,
					of: `${scenario}/${scenario}-plain`,
					...pairedRatio(
						samples.get(key(candidate, `${scenario}-plain`)),
						samples.get(key(candidate, scenario)),
					),
				});
			}
		}
	}

	for (const row of rows) {
		console.log(
			`PASS app-frame-hydration/${row.name}: cold ${row.ops.hydrate_cold.score.toFixed(2)}ms ` +
				`±${row.ops.hydrate_cold.rme.toFixed(1)}%, warm ${row.ops.hydrate_warm.score.toFixed(2)}ms ` +
				`±${row.ops.hydrate_warm.rme.toFixed(1)}% (${row.meta.blocks} blocks, ` +
				`${row.meta.blockRenders} renders, ${row.meta.renderBlockEntries} renderBlock entries, ` +
				`${row.meta.heapBytes} heap bytes, ${row.meta.clientGzipBytes} client gzip bytes)`,
		);
	}
	for (const c of comparisons) {
		console.log(
			`PAIRED app-frame-hydration/${c.scenario} ${c.op}: ${c.of} ${c.ratio.toFixed(3)} ` +
				`[95% CI ${c.low.toFixed(3)}–${c.high.toFixed(3)}] over ${c.pairs} pairs` +
				(c.serverHtmlIdentical === false ? ' (server HTML differs between candidates)' : ''),
		);
	}
} catch (error) {
	failure = errorText(error);
	console.error(`FAIL app-frame-hydration/${failure}`);
} finally {
	for (const instance of [browser, counterBrowser]) {
		try {
			await instance?.close();
		} catch (error) {
			failure ??= `Could not close Chromium: ${errorText(error)}`;
		}
	}
	pages?.server.close();
	fs.rmSync(outRoot, { recursive: true, force: true });
}

const payload = {
	suite: 'app-frame-hydration',
	iterations: rounds,
	targets: rows,
	...(comparisons.length === 0 ? {} : { comparisons }),
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
if (failure) process.exitCode = 1;
