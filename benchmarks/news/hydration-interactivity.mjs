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
const TARGETS = ['octane-tsrx', 'react', 'preact', 'solid', 'svelte', 'vue-vapor', 'inferno'];
const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const positional = args.filter((value) => !value.startsWith('--'));
const target = TARGETS.includes(positional[0]) ? positional.shift() : 'octane-tsrx';
const iterations = Number.parseInt(positional[0] ?? '5', 10);
const warmup = 1;
const extendedStress = process.env.OCTANE_HYDRATION_STRESS === '1';

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
	await sample.page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
	);

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
			focuses: Number(document.querySelector('#hydration-focuses')?.textContent),
			error: state.error,
			focused: document.activeElement === input,
			hydratedAt: state.hydratedAt,
			hydrationCalls: state.hydrationCalls,
			hydrationStartedAt: state.hydrationStartedAt,
			inputSame: input === state.originalInput,
			nativeInputCount: state.nativeInputCount,
			selectionEnd: input?.selectionEnd,
			selectionStart: input?.selectionStart,
			submitted: document.querySelector('#hydration-submitted')?.textContent,
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
		ensure(preservation.text, 'hydration overwrote pre-hydration typing');
		ensure(preservation.focus, 'hydration moved focus away from the input');
		ensure(preservation.caret, 'hydration moved the input caret');

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
			focuses: Number(document.querySelector('#hydration-focuses')?.textContent),
			hydrationCalls: window.__hydrationInteractivity.hydrationCalls,
			replayRootInitializedAt: window.__hydrationInteractivity.replayRootInitializedAt,
		}));
		ensure(before.clicks <= 1, 'the pre-hydration click was handled more than once');
		ensure(before.focuses <= 1, 'the pre-hydration focus was handled more than once');
		ensure(before.hydrationCalls === 0, 'the interaction bypassed the withheld client chunk');
		if (target === 'react') {
			ensure(
				before.replayRootInitializedAt > 0,
				'React did not install its real selective-hydration replay root',
			);
		}

		const hydrated = await releaseHydration(sample);
		ensure(hydrated.clicks <= 1, 'the pre-hydration click was replayed more than once');
		ensure(hydrated.focuses <= 1, 'the pre-hydration focus was replayed more than once');
		const actionSame = await sample.page.evaluate(
			() =>
				document.querySelector('#hydration-action') ===
				window.__hydrationInteractivity.originalAction,
		);
		ensure(actionSame, 'hydration replaced the server-rendered action');

		await button.click();
		await sample.page.waitForFunction(
			(expected) => Number(document.querySelector('#hydration-clicks')?.textContent) === expected,
			hydrated.clicks + 1,
		);
		ensure(sample.failures.length === 0, `browser errors: ${sample.failures.join('; ')}`);

		return {
			hydration: hydrated.hydratedAt - hydrated.releasedAt,
			interactionToHydration: hydrated.hydratedAt - clickedAt,
			replayedClicks: hydrated.clicks - before.clicks,
			replayedFocusEvents: hydrated.focuses - before.focuses,
			handledBeforeHydrationChunk: before.clicks === 1,
			replayRootInitialized: before.replayRootInitializedAt > 0,
		};
	} finally {
		await closeSample(sample);
	}
}

async function runSearchAndSendSample({ keyboard = false } = {}) {
	const sample = await openSample({ cpuRate: 6, controlled: true, interaction: true });
	try {
		const input = sample.page.locator('#hydration-input');
		const button = sample.page.locator('#hydration-action');
		await input.click();
		const typingStartedAt = await sample.page.evaluate(() => {
			window.__hydrationInteractivity.inputAttemptAt = performance.now();
			return window.__hydrationInteractivity.inputAttemptAt;
		});
		await input.pressSequentially(PRE_HYDRATION_TEXT);

		const typed = await sample.page.evaluate(() => ({
			completedAt: performance.now(),
			firstNativeInputAt: window.__hydrationInteractivity.firstNativeInputAt,
			hydrationCalls: window.__hydrationInteractivity.hydrationCalls,
			value: document.querySelector('#hydration-input')?.value,
		}));
		ensure(typed.value === PRE_HYDRATION_TEXT, 'search typing lost characters before Send');
		ensure(typed.hydrationCalls === 0, 'search hydrated before the withheld chunk was released');
		ensure(typed.firstNativeInputAt > 0, 'search typing did not produce native input events');

		const clickedAt = await sample.page.evaluate(() => performance.now());
		if (keyboard) {
			await button.focus();
			await sample.page.keyboard.press('Enter');
		} else {
			await button.click();
		}
		const before = await sample.page.evaluate(() => ({
			clicks: Number(document.querySelector('#hydration-clicks')?.textContent),
			focuses: Number(document.querySelector('#hydration-focuses')?.textContent),
			hydrationCalls: window.__hydrationInteractivity.hydrationCalls,
			replayRootInitializedAt: window.__hydrationInteractivity.replayRootInitializedAt,
			submitted: document.querySelector('#hydration-submitted')?.textContent,
			value: document.querySelector('#hydration-input')?.value,
		}));
		ensure(before.value === PRE_HYDRATION_TEXT, 'clicking Send discarded the search query');
		ensure(before.clicks <= 1, 'Send executed more than once before hydration');
		ensure(before.focuses <= 1, 'the Send focus executed more than once before hydration');
		ensure(before.hydrationCalls === 0, 'Send bypassed the withheld hydration chunk');
		ensure(
			before.clicks === 0 || before.submitted === PRE_HYDRATION_TEXT,
			'Send submitted the wrong query before the hydration chunk was released',
		);
		if (target === 'react') {
			ensure(
				before.replayRootInitializedAt > 0,
				'React did not install its real selective-hydration replay root',
			);
		}

		const hydrated = await releaseHydration(sample);
		ensure(
			hydrated.nativeInputCount === PRE_HYDRATION_TEXT.length,
			`expected ${PRE_HYDRATION_TEXT.length} native search events, received ${hydrated.nativeInputCount}`,
		);
		ensure(hydrated.clicks <= 1, 'the pre-hydration Send click executed more than once');
		ensure(hydrated.focuses <= 1, 'the pre-hydration Send focus executed more than once');
		const delivery = {
			clickDelivered: hydrated.clicks === 1,
			clickReplayed: hydrated.clicks === 1 && before.clicks === 0,
			focusReplayed: hydrated.focuses === 1 && before.focuses === 0,
			handledBeforeHydrationChunk: before.clicks === 1,
			searchPreserved: hydrated.value === PRE_HYDRATION_TEXT,
			submitted: hydrated.submitted,
			deliveredExactlyOnce: hydrated.clicks === 1 && hydrated.submitted === PRE_HYDRATION_TEXT,
			issues: [],
		};
		if (!delivery.clickDelivered) delivery.issues.push('Send click was not delivered');
		if (!delivery.searchPreserved) delivery.issues.push('Search text was not preserved');
		if (delivery.clickDelivered && hydrated.submitted !== PRE_HYDRATION_TEXT) {
			delivery.issues.push('Delivered Send received the wrong search text');
		}
		ensure(delivery.searchPreserved, 'hydration overwrote the pre-hydration search');
		if (target === 'octane-tsrx') {
			ensure(delivery.deliveredExactlyOnce, 'the pre-hydration search was not sent exactly once');
		}

		await button.click();
		await sample.page.waitForFunction(
			({ clicks, submitted }) =>
				Number(document.querySelector('#hydration-clicks')?.textContent) === clicks &&
				document.querySelector('#hydration-submitted')?.textContent === submitted,
			{ clicks: hydrated.clicks + 1, submitted: hydrated.value },
		);
		ensure(sample.failures.length === 0, `browser errors: ${sample.failures.join('; ')}`);

		return {
			firstInput: typed.firstNativeInputAt - typingStartedAt,
			preHydrationTyping: typed.completedAt - typingStartedAt,
			hydration: hydrated.hydratedAt - hydrated.releasedAt,
			hydrationWork: hydrated.hydratedAt - hydrated.hydrationStartedAt,
			interactionToHydration: hydrated.hydratedAt - clickedAt,
			delivery,
		};
	} finally {
		await closeSample(sample);
	}
}

function addSamples(operations, prefix, result) {
	for (const [name, value] of Object.entries(result)) {
		if (
			name === 'delivery' ||
			name === 'replayedClicks' ||
			name === 'replayedFocusEvents' ||
			name === 'handledBeforeHydrationChunk' ||
			name === 'replayRootInitialized' ||
			name === 'preservation'
		) {
			continue;
		}
		const operation = `${prefix}_${name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
		(operations[operation] ??= []).push(value);
	}
}

const rawOperations = {};
const replayCounts = [];
const focusReplayCounts = [];
const replayResults = [];
const searchSendResults = [];
const keyboardSendResults = [];
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
		const searchAndSend = await runSearchAndSendSample();
		const keyboardSend = extendedStress ? await runSearchAndSendSample({ keyboard: true }) : null;

		if (index >= warmup) {
			addSamples(rawOperations, 'uncontrolled_1x', plain);
			addSamples(rawOperations, 'uncontrolled_6x', slowed);
			addSamples(rawOperations, 'controlled_6x', controlled);
			addSamples(rawOperations, 'interaction_6x', replay);
			addSamples(rawOperations, 'search_send_6x', searchAndSend);
			inputPreservation.uncontrolled_1x.push(plain.preservation);
			inputPreservation.uncontrolled_6x.push(slowed.preservation);
			inputPreservation.controlled_6x.push(controlled.preservation);
			replayCounts.push(replay.replayedClicks);
			focusReplayCounts.push(replay.replayedFocusEvents);
			replayResults.push(replay);
			searchSendResults.push(searchAndSend.delivery);
			if (keyboardSend) {
				addSamples(rawOperations, 'keyboard_send_6x', keyboardSend);
				keyboardSendResults.push(keyboardSend.delivery);
			}
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

const userExperience = {
	status:
		searchSendResults.length === 0
			? 'not-run'
			: searchSendResults.every((sample) => sample.deliveredExactlyOnce)
				? 'pass'
				: 'fail',
	samples: searchSendResults.length,
	deliveredSendClicks: searchSendResults.filter((sample) => sample.clickDelivered).length,
	replayedSendClicks: searchSendResults.filter((sample) => sample.clickReplayed).length,
	handledBeforeHydrationChunk: searchSendResults.filter(
		(sample) => sample.handledBeforeHydrationChunk,
	).length,
	droppedSendClicks: searchSendResults.filter((sample) => !sample.clickDelivered).length,
	preservedSearches: searchSendResults.filter((sample) => sample.searchPreserved).length,
	lostSearches: searchSendResults.filter((sample) => !sample.searchPreserved).length,
	exactDeliveries: searchSendResults.filter((sample) => sample.deliveredExactlyOnce).length,
	incorrectSubmissions: searchSendResults.filter(
		(sample) => sample.clickDelivered && sample.submitted !== PRE_HYDRATION_TEXT,
	).length,
	focusOnlyReplays: searchSendResults.filter(
		(sample) => sample.focusReplayed && !sample.clickDelivered,
	).length,
	issues: [...new Set(searchSendResults.flatMap((sample) => sample.issues))],
};

const keyboardExperience = {
	status:
		keyboardSendResults.length === 0
			? 'not-run'
			: keyboardSendResults.every((sample) => sample.deliveredExactlyOnce)
				? 'pass'
				: 'fail',
	samples: keyboardSendResults.length,
	deliveredSendClicks: keyboardSendResults.filter((sample) => sample.clickDelivered).length,
	replayedSendClicks: keyboardSendResults.filter((sample) => sample.clickReplayed).length,
	handledBeforeHydrationChunk: keyboardSendResults.filter(
		(sample) => sample.handledBeforeHydrationChunk,
	).length,
	droppedSendClicks: keyboardSendResults.filter((sample) => !sample.clickDelivered).length,
	preservedSearches: keyboardSendResults.filter((sample) => sample.searchPreserved).length,
	exactDeliveries: keyboardSendResults.filter((sample) => sample.deliveredExactlyOnce).length,
	issues: [...new Set(keyboardSendResults.flatMap((sample) => sample.issues))],
};

const payload = {
	suite: extendedStress ? 'hydration-stress' : 'hydration-interactivity',
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
				replayedFocusEvents: focusReplayCounts,
				interactionResults: replayResults,
				searchSendResults,
				keyboardSendResults,
				keyboardExperience,
				userExperience,
				hydrationEventReplay: replayResults.some(
					(sample) =>
						sample.replayedClicks > 0 ||
						sample.replayedFocusEvents > 0 ||
						(sample.replayRootInitialized && sample.handledBeforeHydrationChunk),
				),
				preRootInteractionReplay: replayResults.some(
					(sample) => sample.replayedClicks > 0 && !sample.replayRootInitialized,
				),
				browser: 'chromium',
			},
		},
	],
};

if (failure) payload.failed = `${target}: ${failure}`;

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

console.log(
	`\n${extendedStress ? 'Hydration stress' : 'Hydration interactivity'} — ${target} (production, real Chromium typing)`,
);
console.log(`Server-rendered articles: ${CARD_COUNT}; CPU throttling: 1× and 6×`);
console.log(
	`Hydration event replay: ${payload.targets[0].meta.hydrationEventReplay ? 'observed' : 'not observed'}`,
);
console.log(
	`Pre-root interaction replay: ${payload.targets[0].meta.preRootInteractionReplay ? 'observed' : 'not observed'}`,
);
for (const [scenario, samples] of Object.entries(inputPreservation)) {
	if (samples.length === 0) continue;
	console.log(
		`Pre-hydration input (${scenario}): ${samples.every((sample) => sample.text) ? 'preserved' : 'overwritten'}`,
	);
}
if (userExperience.samples > 0) {
	console.log(`Pre-hydration search-and-send UX: ${userExperience.status.toUpperCase()}`);
	console.log(
		`  Send clicks delivered: ${userExperience.deliveredSendClicks}/${userExperience.samples}`,
	);
	console.log(
		`  Send clicks replayed after hydration: ${userExperience.replayedSendClicks}/${userExperience.samples}`,
	);
	console.log(
		`  Send clicks handled before the hydration chunk: ${userExperience.handledBeforeHydrationChunk}/${userExperience.samples}`,
	);
	console.log(
		`  Send clicks dropped: ${userExperience.droppedSendClicks}/${userExperience.samples}`,
	);
	console.log(
		`  Search queries preserved: ${userExperience.preservedSearches}/${userExperience.samples}`,
	);
	console.log(
		`  Exact search deliveries: ${userExperience.exactDeliveries}/${userExperience.samples}`,
	);
	if (userExperience.incorrectSubmissions > 0) {
		console.log(
			`  Delivered Sends with the wrong query: ${userExperience.incorrectSubmissions}/${userExperience.samples}`,
		);
	}
	if (userExperience.focusOnlyReplays > 0) {
		console.log(
			`  Focus-only replays without Send: ${userExperience.focusOnlyReplays}/${userExperience.samples}`,
		);
	}
	if (userExperience.issues.length > 0) {
		console.log(`  UX correctness issues: ${userExperience.issues.join('; ')}`);
	}
}
if (keyboardExperience.samples > 0) {
	console.log(`Pre-hydration keyboard-and-send UX: ${keyboardExperience.status.toUpperCase()}`);
	console.log(
		`  Enter activations delivered: ${keyboardExperience.deliveredSendClicks}/${keyboardExperience.samples}`,
	);
	console.log(
		`  Enter activations dropped: ${keyboardExperience.droppedSendClicks}/${keyboardExperience.samples}`,
	);
	console.log(
		`  Exact keyboard deliveries: ${keyboardExperience.exactDeliveries}/${keyboardExperience.samples}`,
	);
	if (keyboardExperience.issues.length > 0) {
		console.log(`  Keyboard UX correctness issues: ${keyboardExperience.issues.join('; ')}`);
	}
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
