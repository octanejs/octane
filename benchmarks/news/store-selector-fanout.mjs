process.env.NODE_ENV = 'production';

import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build } from 'vite';
import {
	PARENT_RERENDER_COUNT,
	SELECTOR_INPUT_SIZE,
	SELECTOR_SUBSCRIBER_COUNT,
} from '../store-selector-fanout/shared.js';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGETS = ['octane-tsrx', 'react', 'preact', 'solid', 'svelte', 'vue-vapor', 'inferno'];
const WRITE_VALUE = 7;
const REWRITE_VALUE = 9;
const WRITE_TOTAL = String(WRITE_VALUE * SELECTOR_INPUT_SIZE);
const REWRITE_TOTAL = String(REWRITE_VALUE * SELECTOR_INPUT_SIZE);

const args = process.argv.slice(2);
const positional = args.filter((value) => !value.startsWith('--'));
const target = TARGETS.includes(positional[0]) ? positional.shift() : 'octane-tsrx';
const iterations = Number.parseInt(positional[0] ?? '5', 10);

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Store selector fan-out iterations must be a positive integer');
}

const appDirectory = path.join(HERE, target);
const clientDirectory = path.join(appDirectory, 'dist/store-selector-fanout');
const clientHtml = path.join(clientDirectory, 'store-selector-fanout.html');

if (!args.includes('--no-build')) {
	console.log(`Building ${target} store selector fixture (production)…`);
	await build({
		root: appDirectory,
		logLevel: 'warn',
		build: {
			outDir: path.relative(appDirectory, clientDirectory),
			emptyOutDir: true,
			minify: 'esbuild',
			rollupOptions: {
				input: path.join(appDirectory, 'store-selector-fanout.html'),
				output: {
					chunkFileNames: 'assets/[name]-[hash].js',
					entryFileNames: 'assets/[name]-[hash].js',
				},
			},
		},
	});
}

if (!fs.existsSync(clientHtml)) {
	throw new Error(`Missing production store selector assets for ${target}`);
}

const contentTypes = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.svg': 'image/svg+xml',
};

const server = createServer((request, response) => {
	try {
		const url = new URL(request.url ?? '/', 'http://127.0.0.1');
		const file =
			url.pathname === '/'
				? clientHtml
				: path.resolve(clientDirectory, `.${decodeURIComponent(url.pathname)}`);
		if (
			(file === clientHtml || file.startsWith(`${clientDirectory}${path.sep}`)) &&
			fs.existsSync(file) &&
			fs.statSync(file).isFile()
		) {
			response.setHeader(
				'content-type',
				contentTypes[path.extname(file)] ?? 'application/octet-stream',
			);
			response.end(fs.readFileSync(file));
			return;
		}
		response.statusCode = 404;
		response.end('Not found');
	} catch (error) {
		response.statusCode = 500;
		response.end(error instanceof Error ? error.message : String(error));
	}
});

await new Promise((resolve, reject) => {
	server.once('error', reject);
	server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
if (address === null || typeof address === 'string') {
	throw new Error('The store selector server did not expose a TCP port');
}

const origin = `http://127.0.0.1:${address.port}`;
let browser;

function ensure(condition, message) {
	if (!condition) throw new Error(`${target}: ${message}`);
}

async function openSample() {
	const context = await browser.newContext();
	const page = await context.newPage();
	const failures = [];
	page.setDefaultTimeout(30_000);
	page.on('pageerror', (error) => failures.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') failures.push(message.text());
	});
	await page.goto(origin, { waitUntil: 'domcontentloaded' });
	try {
		await page.waitForFunction(() => window.__storeSelectorStress?.ready === true, null, {
			timeout: 10_000,
		});
	} catch (error) {
		const details = failures.length > 0 ? failures.join('; ') : 'bootstrap never became ready';
		await context.close();
		throw new Error(`${target}: production store selector fixture failed to start: ${details}`, {
			cause: error,
		});
	}
	ensure(failures.length === 0, `production browser errors: ${failures.join('; ')}`);
	return { context, failures, page };
}

/** Every mounted subscriber shows `total`, and its parent-driven prop is `generation`. */
function subscribersSettled({ count, generation, total }) {
	const nodes = Array.from(document.querySelectorAll('[data-subscriber-index]'));
	return (
		nodes.length === count &&
		nodes.every(
			(node) =>
				node.textContent === total &&
				(generation === null || node.getAttribute('data-generation') === generation),
		)
	);
}

async function runSample() {
	const sample = await openSample();
	const { page } = sample;
	try {
		const mountStarted = await page.evaluate(() => performance.now());
		await page.locator('#selector-toggle').click();
		await page.waitForFunction(
			(count) =>
				document.querySelectorAll('[data-subscriber-index]').length === count &&
				window.__storeSelectorStress.store.size === count,
			SELECTOR_SUBSCRIBER_COUNT,
		);
		const mountedAt = await page.evaluate(() => performance.now());

		// A real store write: the selection genuinely changes, so every subscriber
		// must recompute and repaint. This is the control that proves a cheap
		// re-render number was not bought by dropping the subscription.
		const writeStarted = await page.evaluate(() => performance.now());
		await page.locator('#selector-write').click();
		await page.waitForFunction(subscribersSettled, {
			count: SELECTOR_SUBSCRIBER_COUNT,
			generation: '0',
			total: WRITE_TOTAL,
		});
		const writtenAt = await page.evaluate(() => performance.now());

		// The measured op: unrelated parent re-renders with the store untouched.
		// Driven and timed inside the page so neither a Playwright round trip nor
		// a timer floor sits between renders.
		const rerendered = await page.evaluate(async (count) => {
			const stress = window.__storeSelectorStress;
			const selectorCallsBefore = stress.stats.selectorCalls;
			const snapshotCallsBefore = stress.stats.snapshotCalls;
			const subscriberRendersBefore = stress.stats.subscriberRenders;
			const startedAt = performance.now();
			for (let index = 0; index < count; index++) await stress.flush(() => stress.bump());
			const completedAt = performance.now();
			return {
				completedAt,
				selectorCalls: stress.stats.selectorCalls - selectorCallsBefore,
				snapshotCalls: stress.stats.snapshotCalls - snapshotCallsBefore,
				startedAt,
				subscriberRenders: stress.stats.subscriberRenders - subscriberRendersBefore,
			};
		}, PARENT_RERENDER_COUNT);
		await page.waitForFunction(subscribersSettled, {
			count: SELECTOR_SUBSCRIBER_COUNT,
			generation: String(PARENT_RERENDER_COUNT),
			total: WRITE_TOTAL,
		});
		const generationText = await page.evaluate(
			() => document.querySelector('#selector-generation')?.textContent,
		);
		ensure(
			generationText === String(PARENT_RERENDER_COUNT),
			'the parent did not complete every unrelated re-render',
		);

		// A second real write after the re-render burst: subscriptions established
		// before the burst must still deliver.
		const rewriteStarted = await page.evaluate(() => performance.now());
		await page.locator('#selector-rewrite').click();
		await page.waitForFunction(subscribersSettled, {
			count: SELECTOR_SUBSCRIBER_COUNT,
			generation: String(PARENT_RERENDER_COUNT),
			total: REWRITE_TOTAL,
		});
		const rewrittenAt = await page.evaluate(() => performance.now());

		const unmountStarted = await page.evaluate(() => performance.now());
		await page.locator('#selector-toggle').click();
		await page.waitForFunction(
			() =>
				document.querySelectorAll('[data-subscriber-index]').length === 0 &&
				window.__storeSelectorStress.store.size === 0,
		);
		const state = await page.evaluate(() => ({
			completedAt: performance.now(),
			...window.__storeSelectorStress.stats,
			retainedSubscribers: window.__storeSelectorStress.store.size,
		}));

		ensure(state.subscribeCalls >= SELECTOR_SUBSCRIBER_COUNT, 'subscribers never connected');
		ensure(
			state.subscribeCalls === state.unsubscribeCalls,
			'a store subscription was not cleaned up exactly once',
		);
		ensure(state.retainedSubscribers === 0, 'the store retained an unmounted subscriber');
		ensure(
			state.notifications >= SELECTOR_SUBSCRIBER_COUNT * 2,
			'a store write did not reach every subscriber',
		);
		ensure(
			state.selectorCalls >= SELECTOR_SUBSCRIBER_COUNT * 2,
			'the two store writes did not run the selection for every subscriber',
		);
		ensure(sample.failures.length === 0, sample.failures.join('; '));

		return {
			ops: {
				mount: mountedAt - mountStarted,
				store_write: writtenAt - writeStarted,
				parent_rerenders: rerendered.completedAt - rerendered.startedAt,
				store_write_after_rerenders: rewrittenAt - rewriteStarted,
				unmount: state.completedAt - unmountStarted,
			},
			meta: {
				inputSize: SELECTOR_INPUT_SIZE,
				notifications: state.notifications,
				parentRerenders: PARENT_RERENDER_COUNT,
				retainedSubscribers: state.retainedSubscribers,
				// The signal that is purely attributable to selector identity: the
				// store never moves during the burst, so every one of these is work
				// a stable selector would not have done.
				selectorCallsDuringRerenders: rerendered.selectorCalls,
				selectorCallsTotal: state.selectorCalls,
				snapshotCallsDuringRerenders: rerendered.snapshotCalls,
				snapshotCallsTotal: state.snapshotCalls,
				subscribeCalls: state.subscribeCalls,
				subscriberCount: SELECTOR_SUBSCRIBER_COUNT,
				// Read alongside `selectorCallsDuringRerenders`: on a render-pass
				// framework this stays at 512 per re-render, so zero selector calls
				// means the selection was reused, not that the renders were skipped.
				subscriberRendersDuringRerenders: rerendered.subscriberRenders,
				subscriberRendersTotal: state.subscriberRenders,
				unsubscribeCalls: state.unsubscribeCalls,
			},
		};
	} finally {
		await sample.context.close();
	}
}

const rawOperations = {};
const samples = [];
let failure;

try {
	browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
	for (let index = 0; index < iterations + 1; index++) {
		const result = await runSample();
		if (index === 0) continue;
		for (const [name, value] of Object.entries(result.ops)) {
			(rawOperations[name] ??= []).push(value);
		}
		samples.push(result.meta);
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
} finally {
	await browser?.close();
	await new Promise((resolve) => server.close(resolve));
}

const payload = {
	suite: 'store-selector-fanout',
	iterations,
	targets: [
		{
			name: target,
			ops: Object.fromEntries(
				Object.entries(rawOperations).map(([name, values]) => [
					name,
					timingStatForJson(summarizeSamples(values), { p99: true }),
				]),
			),
			meta: {
				browser: 'chromium',
				correctness: failure ? 'fail' : 'pass',
				samples,
			},
		},
	],
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) {
	console.error(`FAIL store-selector-fanout/${target}: ${failure}`);
	process.exitCode = 1;
} else {
	console.log(
		`PASS store-selector-fanout/${target}: ${iterations} correctness-gated Chromium samples ` +
			`(${samples[0].selectorCallsDuringRerenders} selector calls across ` +
			`${PARENT_RERENDER_COUNT} unrelated parent re-renders)`,
	);
	console.table(
		Object.fromEntries(
			Object.entries(payload.targets[0].ops).map(([name, stats]) => [
				name,
				{ 'score (ms)': stats.score, 'p95 (ms)': stats.p95, samples: stats.samples },
			]),
		),
	);
}
