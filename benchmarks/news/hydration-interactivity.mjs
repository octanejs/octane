process.env.NODE_ENV = 'production';

import { build } from 'vite';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
	CARDS,
	CARD_COUNT,
	POST_HYDRATION_TEXT,
	PRE_HYDRATION_TEXT,
} from '../hydration-interactivity/shared.js';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGETS = ['octane-tsrx', 'react', 'preact', 'solid', 'svelte', 'vue-vapor'];
const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const positional = args.filter((value) => !value.startsWith('--'));
const target = TARGETS.includes(positional[0]) ? positional.shift() : 'octane-tsrx';
const supportsPreRootInteractionReplay = target === 'octane-tsrx' || target === 'solid';
const iterations = Number.parseInt(positional[0] ?? '5', 10);
const warmup = 1;

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Hydration interactivity iterations must be a positive integer');
}

const appDirectory = path.join(HERE, target);
const outputDirectory = path.join(appDirectory, 'dist/hydration-interactivity');
const clientDirectory = path.join(outputDirectory, 'client');
const serverEntry = path.join(outputDirectory, 'server/hydration-server.js');
const clientHtml = path.join(clientDirectory, 'hydration-interactivity.html');

if (!noBuild) {
	console.log(`Building ${target} hydration interactivity fixtures (production)…`);
	await build({
		root: appDirectory,
		logLevel: 'warn',
		build: {
			outDir: path.relative(appDirectory, clientDirectory),
			emptyOutDir: true,
			minify: 'esbuild',
			rollupOptions: {
				input: path.join(appDirectory, 'hydration-interactivity.html'),
				output: {
					chunkFileNames: 'assets/[name]-[hash].js',
					entryFileNames: 'assets/[name]-[hash].js',
				},
			},
		},
	});
	await build({
		root: appDirectory,
		logLevel: 'warn',
		build: {
			ssr: 'src/hydration-interactivity/hydration-server.ts',
			outDir: path.relative(appDirectory, path.dirname(serverEntry)),
			emptyOutDir: true,
		},
	});
}

if (!fs.existsSync(clientHtml) || !fs.existsSync(serverEntry)) {
	throw new Error(`Missing production hydration interactivity assets for ${target}`);
}

const { renderApp } = await import(pathToFileURL(serverEntry).href);
const template = fs.readFileSync(clientHtml, 'utf8');
const contentTypes = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.svg': 'image/svg+xml',
};

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url ?? '/', 'http://127.0.0.1');
		if (url.pathname === '/') {
			const props = {
				controlled: url.searchParams.get('controlled') === '1',
				deferred: url.searchParams.get('mode') === 'interaction',
			};
			const { body, css, head } = await renderApp(props);
			response.setHeader('content-type', contentTypes['.html']);
			response.end(
				template.replace('<!--ssr-head-->', head + css).replace('<!--ssr-body-->', body),
			);
			return;
		}

		const file = path.resolve(clientDirectory, `.${decodeURIComponent(url.pathname)}`);
		if (
			file.startsWith(`${clientDirectory}${path.sep}`) &&
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
	throw new Error('The hydration interactivity server did not expose a TCP port');
}

const origin = `http://127.0.0.1:${address.port}`;
let browser;

function ensure(condition, message) {
	if (!condition) throw new Error(`${target}: ${message}`);
}

function createGate() {
	let open;
	const pending = new Promise((resolve) => {
		open = resolve;
	});
	return { open, pending };
}

async function openSample({ cpuRate, controlled = false, interaction = false }) {
	const context = await browser.newContext();
	const page = await context.newPage();
	page.setDefaultTimeout(30_000);
	const failures = [];
	page.on('pageerror', (error) => failures.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') failures.push(message.text());
	});

	const cdp = await context.newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });

	const clientGate = createGate();
	const clientRequest = page.waitForRequest((request) =>
		/\/assets\/hydration-client-[^/]+\.js(?:\?|$)/.test(request.url()),
	);
	await page.route('**/assets/hydration-client-*.js', async (route) => {
		await clientGate.pending;
		await route.continue();
	});

	const search = new URLSearchParams();
	if (controlled) search.set('controlled', '1');
	if (interaction) search.set('mode', 'interaction');
	const suffix = search.size === 0 ? '' : `?${search}`;
	await page.goto(`${origin}/${suffix}`, { waitUntil: 'domcontentloaded' });
	await clientRequest;
	await page.waitForFunction(() => window.__hydrationInteractivity?.bootstrapAt > 0);

	await page.evaluate(() => {
		const status = window.__hydrationInteractivity;
		status.originalInput = document.querySelector('#hydration-input');
		status.originalCard = document.querySelector('#hydration-cards > li');
		status.originalAction = document.querySelector('#hydration-action');
	});

	return { clientGate, context, failures, page };
}

async function releaseHydration(sample) {
	const releasedAt = await sample.page.evaluate(() => performance.now());
	sample.clientGate.open();
	await sample.page.waitForFunction(() => {
		const state = window.__hydrationInteractivity;
		return state?.hydratedAt > 0 || Boolean(state?.error);
	});

	const snapshot = await sample.page.evaluate(() => {
		const state = window.__hydrationInteractivity;
		const input = document.querySelector('#hydration-input');
		return {
			cardCount: document.querySelectorAll('#hydration-cards > li').length,
			cardSignature: Array.from(document.querySelectorAll('#hydration-cards > li'), (card) =>
				[
					card.getAttribute('data-card-id'),
					card.querySelector('h2')?.textContent,
					card.querySelector('p')?.textContent,
				].join('\u001f'),
			).join('\u001e'),
			cardSame: document.querySelector('#hydration-cards > li') === state.originalCard,
			clicks: Number(document.querySelector('#hydration-clicks')?.textContent),
			error: state.error,
			focused: document.activeElement === input,
			hydratedAt: state.hydratedAt,
			hydrationCalls: state.hydrationCalls,
			hydrationStartedAt: state.hydrationStartedAt,
			inputSame: input === state.originalInput,
			nativeInputCount: state.nativeInputCount,
			selectionEnd: input?.selectionEnd,
			selectionStart: input?.selectionStart,
			value: input?.value,
		};
	});

	ensure(!snapshot.error, `production client failed: ${snapshot.error}`);
	ensure(sample.failures.length === 0, `browser errors: ${sample.failures.join('; ')}`);
	ensure(snapshot.hydrationCalls === 1, 'hydration must run exactly once');
	ensure(snapshot.cardCount === CARD_COUNT, `expected ${CARD_COUNT} server-rendered articles`);
	ensure(
		snapshot.cardSignature ===
			CARDS.map((card) => [card.id, card.title, card.description].join('\u001f')).join('\u001e'),
		'hydration changed the shared article content or order',
	);
	ensure(snapshot.cardSame, 'hydration replaced a server-rendered article');
	ensure(snapshot.inputSame, 'hydration replaced the server-rendered input');

	return { ...snapshot, releasedAt };
}

async function closeSample(sample) {
	sample.clientGate.open();
	await sample.context.close();
}

async function runTypingSample({ cpuRate, controlled }) {
	const sample = await openSample({ cpuRate, controlled });
	try {
		const input = sample.page.locator('#hydration-input');
		await input.click();
		const typingStartedAt = await sample.page.evaluate(() => {
			window.__hydrationInteractivity.inputAttemptAt = performance.now();
			return window.__hydrationInteractivity.inputAttemptAt;
		});
		await input.pressSequentially(PRE_HYDRATION_TEXT);

		const before = await sample.page.evaluate(() => {
			const state = window.__hydrationInteractivity;
			const input = document.querySelector('#hydration-input');
			return {
				completedAt: performance.now(),
				firstNativeInputAt: state.firstNativeInputAt,
				focused: document.activeElement === input,
				hydrated: state.hydrationCalls !== 0,
				selectionEnd: input.selectionEnd,
				selectionStart: input.selectionStart,
				value: input.value,
			};
		});

		ensure(!before.hydrated, 'client hydrated before the withheld chunk was released');
		ensure(before.value === PRE_HYDRATION_TEXT, 'native pre-hydration typing lost characters');
		ensure(before.focused, 'pre-hydration typing lost input focus');
		ensure(
			before.selectionStart === PRE_HYDRATION_TEXT.length &&
				before.selectionEnd === PRE_HYDRATION_TEXT.length,
			'pre-hydration typing did not preserve the caret',
		);
		ensure(before.firstNativeInputAt > 0, 'Playwright did not produce native input events');

		const hydrated = await releaseHydration(sample);
		const preservation = {
			text: hydrated.value === PRE_HYDRATION_TEXT,
			focus: hydrated.focused,
			caret:
				hydrated.selectionStart === PRE_HYDRATION_TEXT.length &&
				hydrated.selectionEnd === PRE_HYDRATION_TEXT.length,
		};
		if (target === 'octane-tsrx') {
			ensure(preservation.text, 'hydration overwrote pre-hydration typing');
			ensure(preservation.focus, 'hydration moved focus away from the input');
			ensure(preservation.caret, 'hydration moved the input caret');
		}

		const postStartedAt = await sample.page.evaluate(() => performance.now());
		await input.pressSequentially(POST_HYDRATION_TEXT);
		const expected = hydrated.value + POST_HYDRATION_TEXT;
		await sample.page.waitForFunction(
			(value) =>
				document.querySelector('#hydration-input')?.value === value &&
				document.querySelector('#hydration-output')?.textContent === value,
			expected,
		);
		const final = await sample.page.evaluate(() => ({
			completedAt: performance.now(),
			focused: document.activeElement === document.querySelector('#hydration-input'),
			inputSame:
				document.querySelector('#hydration-input') ===
				window.__hydrationInteractivity.originalInput,
			nativeInputCount: window.__hydrationInteractivity.nativeInputCount,
			output: document.querySelector('#hydration-output')?.textContent,
			selectionEnd: document.querySelector('#hydration-input')?.selectionEnd,
			value: document.querySelector('#hydration-input')?.value,
		}));

		ensure(final.inputSame, 'the first live update replaced the input');
		ensure(final.focused, 'the first live update moved focus');
		ensure(final.selectionEnd === expected.length, 'the first live update moved the caret');
		ensure(
			final.value === expected && final.output === expected,
			'component state lost typed text',
		);
		ensure(
			final.nativeInputCount === (PRE_HYDRATION_TEXT + POST_HYDRATION_TEXT).length,
			`expected ${(PRE_HYDRATION_TEXT + POST_HYDRATION_TEXT).length} native input events, received ${final.nativeInputCount}`,
		);

		return {
			firstInput: before.firstNativeInputAt - typingStartedAt,
			preHydrationTyping: before.completedAt - typingStartedAt,
			hydration: hydrated.hydratedAt - hydrated.releasedAt,
			hydrationWork: hydrated.hydratedAt - hydrated.hydrationStartedAt,
			postHydrationTyping: final.completedAt - postStartedAt,
			preservation,
		};
	} finally {
		await closeSample(sample);
	}
}

async function runReplaySample() {
	const sample = await openSample({ cpuRate: 6, interaction: true });
	try {
		const button = sample.page.locator('#hydration-action');
		const clickedAt = await sample.page.evaluate(() => performance.now());
		await button.click();
		const before = await sample.page.evaluate(() => ({
			clicks: Number(document.querySelector('#hydration-clicks')?.textContent),
			hydrationCalls: window.__hydrationInteractivity.hydrationCalls,
		}));
		ensure(before.clicks === 0, 'the delayed client handled a click before hydration');
		ensure(before.hydrationCalls === 0, 'the interaction bypassed the withheld client chunk');

		const hydrated = await releaseHydration(sample);
		const expectedReplay = supportsPreRootInteractionReplay ? 1 : 0;
		ensure(
			hydrated.clicks === expectedReplay,
			`expected ${expectedReplay} replayed clicks, observed ${hydrated.clicks}`,
		);
		const actionSame = await sample.page.evaluate(
			() =>
				document.querySelector('#hydration-action') ===
				window.__hydrationInteractivity.originalAction,
		);
		ensure(actionSame, 'hydration replaced the server-rendered action');

		await button.click();
		await sample.page.waitForFunction(
			(expected) => Number(document.querySelector('#hydration-clicks')?.textContent) === expected,
			expectedReplay + 1,
		);
		ensure(sample.failures.length === 0, `browser errors: ${sample.failures.join('; ')}`);

		return {
			hydration: hydrated.hydratedAt - hydrated.releasedAt,
			interactionToHydration: hydrated.hydratedAt - clickedAt,
			replayedClicks: expectedReplay,
		};
	} finally {
		await closeSample(sample);
	}
}

function addSamples(operations, prefix, result) {
	for (const [name, value] of Object.entries(result)) {
		if (name === 'replayedClicks' || name === 'preservation') continue;
		const operation = `${prefix}_${name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
		(operations[operation] ??= []).push(value);
	}
}

const rawOperations = {};
const replayCounts = [];
const inputPreservation = {
	uncontrolled_1x: [],
	uncontrolled_6x: [],
	controlled_6x: [],
};
let failure;

try {
	browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
	for (let index = 0; index < warmup + iterations; index++) {
		const plain = await runTypingSample({ cpuRate: 1, controlled: false });
		const slowed = await runTypingSample({ cpuRate: 6, controlled: false });
		const controlled = await runTypingSample({ cpuRate: 6, controlled: true });
		const replay = await runReplaySample();

		if (index >= warmup) {
			addSamples(rawOperations, 'uncontrolled_1x', plain);
			addSamples(rawOperations, 'uncontrolled_6x', slowed);
			addSamples(rawOperations, 'controlled_6x', controlled);
			addSamples(rawOperations, 'interaction_6x', replay);
			inputPreservation.uncontrolled_1x.push(plain.preservation);
			inputPreservation.uncontrolled_6x.push(slowed.preservation);
			inputPreservation.controlled_6x.push(controlled.preservation);
			replayCounts.push(replay.replayedClicks);
		}
	}
} catch (error) {
	failure = error instanceof Error ? error.message : String(error);
} finally {
	await browser?.close();
	await new Promise((resolve) => server.close(resolve));
}

const operations = Object.fromEntries(
	Object.entries(rawOperations).map(([name, samples]) => [
		name,
		timingStatForJson(summarizeSamples(samples), { p99: true }),
	]),
);

const payload = {
	suite: 'hydration-interactivity',
	iterations,
	targets: [
		{
			name: target,
			ops: operations,
			meta: {
				cardCount: CARD_COUNT,
				cpuRates: [1, 6],
				nativeInputEvents: (PRE_HYDRATION_TEXT + POST_HYDRATION_TEXT).length,
				inputPreservation,
				preHydrationText: PRE_HYDRATION_TEXT,
				postHydrationText: POST_HYDRATION_TEXT,
				replayedClicks: replayCounts,
				preRootInteractionReplay: supportsPreRootInteractionReplay,
				browser: 'chromium',
			},
		},
	],
};

if (failure) payload.failed = `${target}: ${failure}`;

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

console.log(`\nHydration interactivity — ${target} (production, real Chromium typing)`);
console.log(`Server-rendered articles: ${CARD_COUNT}; CPU throttling: 1× and 6×`);
console.log(
	`Pre-root interaction replay: ${supportsPreRootInteractionReplay ? 'supported' : 'not claimed'}`,
);
for (const [scenario, samples] of Object.entries(inputPreservation)) {
	if (samples.length === 0) continue;
	console.log(
		`Pre-hydration input (${scenario}): ${samples.every((sample) => sample.text) ? 'preserved' : 'overwritten'}`,
	);
}
console.log('\nOperation                                  score     median        p95');
for (const [name, stats] of Object.entries(operations)) {
	console.log(
		`${name.padEnd(40)} ${stats.score.toFixed(2).padStart(8)} ${stats.median
			.toFixed(2)
			.padStart(10)} ${stats.p95.toFixed(2).padStart(10)} ms`,
	);
}

if (failure) {
	console.error(`\nHydration interactivity correctness gate failed: ${failure}`);
	process.exitCode = 1;
}
