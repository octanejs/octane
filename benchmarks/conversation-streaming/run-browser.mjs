import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { measurementEnvironment, readBuild, startServer } from './build.mjs';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const SCENARIOS = ['body-first', 'history-first', 'large-waves', 'denied'];
const TIMEOUT = 15_000;
const WARMUP = 5;

// Installed before navigation. These timestamps observe DOM state, not paint,
// and include the cost of this observer in every measured response.
function observePage() {
	const state = {
		marks: {},
		regions: [],
		inputs: [],
		replayedInputs: [],
		activation: null,
	};
	window.__conversationBrowserBench = state;
	const observe = () => {
		const now = performance.now();
		const shell = document.querySelector('[data-bench-shell]');
		const body = document.querySelector('[data-body]');
		const history = document.querySelector('[data-history]');
		if (shell && state.marks.shell === undefined) state.marks.shell = now;
		if (body?.querySelector('[data-turn]') && state.marks.body === undefined)
			state.marks.body = now;
		if (history?.querySelector('[data-conversation]') && state.marks.history === undefined)
			state.marks.history = now;
		const counts = {
			body: body?.querySelectorAll('[data-turn]').length ?? 0,
			history: history?.querySelectorAll('[data-conversation]').length ?? 0,
			bodyPending: !!document.querySelector('[data-body-pending]'),
			historyPending: !!document.querySelector('[data-history-pending]'),
		};
		for (const [name, node] of [
			['body', body],
			['history', history],
		]) {
			if (
				node &&
				counts[name] === Number(node.getAttribute('data-total')) &&
				state.marks[`${name}Complete`] === undefined
			) {
				state.marks[`${name}Complete`] = now;
			}
		}
		const previous = state.regions.at(-1);
		if (!previous || Object.keys(counts).some((key) => counts[key] !== previous[key])) {
			state.regions.push({ at: now, ...counts });
		}
		if (document.querySelector('[data-composer-ready="true"]')) {
			if (state.marks.composerReady === undefined) state.marks.composerReady = now;
			const input = state.inputs.at(-1);
			if (
				input &&
				input.derived === undefined &&
				document.querySelector('[data-draft-length]')?.textContent === String(input.value.length)
			) {
				input.derived = now;
			}
		}
	};
	new MutationObserver(observe).observe(document, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
	});
	addEventListener(
		'focusin',
		(event) => {
			if (event.target.matches?.('textarea[name="draft"]') && state.activation === null) {
				state.activation = performance.now();
			}
		},
		true,
	);
	addEventListener(
		'pointerdown',
		(event) => {
			const region = event.target.closest?.('[data-region]')?.getAttribute('data-region');
			if (
				(region === 'body' || region === 'history') &&
				state.marks[`${region}Activation`] === undefined
			) {
				state.marks[`${region}Activation`] = performance.now();
			}
		},
		true,
	);
	addEventListener(
		'input',
		(event) => {
			if (!event.target.matches?.('textarea[name="draft"]')) return;
			const input = { at: performance.now(), value: event.target.value, trusted: event.isTrusted };
			if (!event.isTrusted) {
				state.replayedInputs.push(input);
				return;
			}
			state.inputs.push(input);
			const frame = () => {
				if (state.inputs.at(-1) !== input) return;
				observe();
				if (input.derived !== undefined) input.raf = performance.now();
				else if (performance.now() - input.at < 15_000) requestAnimationFrame(frame);
			};
			requestAnimationFrame(frame);
		},
		true,
	);
	addEventListener('DOMContentLoaded', observe, { once: true });
}

function authoredChunks(graph, assets, component) {
	const files = Object.entries(graph)
		.filter(
			([file, entry]) =>
				assets[file] &&
				entry.modules.some((id) => id.replaceAll('\\', '/').endsWith(`/src/${component}.tsrx`)),
		)
		.map(([file]) => file);
	assert.ok(files.length > 0, `No authored ${component} chunk in the production graph`);
	return files;
}

function physicalSet(files, assets) {
	const unique = [...new Set(files)].sort();
	const result = { files: unique, js: 0, css: 0, raw: 0, gzip: 0, brotli: 0 };
	for (const file of unique) {
		assert.ok(assets[file], `Requested asset missing from measured graph: ${file}`);
		result[file.endsWith('.css') ? 'css' : 'js']++;
		for (const metric of ['raw', 'gzip', 'brotli']) result[metric] += assets[file][metric];
	}
	return result;
}

function deliveryPhases(requests, assets) {
	const seen = new Set();
	const completed = new Set();
	const phases = {};
	for (const phase of ['startup', 'activation', 'full-release']) {
		const eligible = requests.filter((request) => request.phase === phase && request.file);
		const firstRequested = eligible
			.map((request) => request.file)
			.filter((file) => !seen.has(file));
		for (const file of firstRequested) seen.add(file);
		const firstCompleted = requests
			.filter(
				(request) =>
					request.completedPhase === phase && request.file && !completed.has(request.file),
			)
			.map((request) => request.file);
		for (const file of firstCompleted) completed.add(file);
		phases[phase] = {
			firstRequested: physicalSet(firstRequested, assets),
			firstCompleted: physicalSet(firstCompleted, assets),
		};
	}
	return {
		phases,
		allRequested: physicalSet(
			requests.filter((request) => request.file).map((request) => request.file),
			assets,
		),
		allCompleted: physicalSet(
			requests
				.filter((request) => request.file && request.completedPhase)
				.map((request) => request.file),
			assets,
		),
		policy:
			'Unique emitted JS/CSS files. gzip level 9; Brotli quality 11. Not transferred bytes: headers, duplicates, compression framing and caches are excluded. Requests and completion phases are distinct; an earlier blocked request can finish after activation.',
	};
}

function assertUnevaluated(modules, names) {
	for (const name of names)
		assert.ok(!modules.includes(name), `${name} evaluated before its release`);
}

async function moduleLog(page) {
	return page.evaluate(() => [...(window.__conversationBenchModules ?? [])]);
}

async function verifyRows(page, config, oracle, initialSnapshot = false) {
	if (config.scenario === 'denied') {
		await page.locator('[data-body-error]').waitFor();
		await page.locator('[data-history-error]').waitFor();
		assert.equal(await page.locator('[data-turn], [data-conversation]').count(), 0);
		return;
	}
	const bodyCount = initialSnapshot ? Math.ceil(config.bodyCount / config.waves) : config.bodyCount;
	const historyCount = initialSnapshot
		? Math.ceil(config.historyCount / config.waves)
		: config.historyCount;
	await page.waitForFunction(
		({ bodyCount, historyCount, waves }) => {
			const body = document.querySelector('[data-body]');
			const history = document.querySelector('[data-history]');
			return (
				body?.querySelectorAll('[data-turn]').length === bodyCount &&
				history?.querySelectorAll('[data-conversation]').length === historyCount &&
				body.getAttribute('data-revision') === String(waves) &&
				history.getAttribute('data-revision') === String(waves)
			);
		},
		{ bodyCount, historyCount, waves: initialSnapshot ? 1 : config.waves },
		{ timeout: TIMEOUT },
	);
	const actual = await page.evaluate(() => ({
		body: [...document.querySelectorAll('[data-turn]')].map((node) => ({
			id: node.getAttribute('data-turn'),
			prompt: node.querySelector('[data-prompt]').textContent,
			answer: node.querySelector('[data-answer]').textContent,
		})),
		history: [...document.querySelectorAll('[data-conversation]')].map((node) => ({
			id: node.getAttribute('data-conversation'),
			title: node.querySelector('[data-title]').textContent,
			preview: node.querySelector('[data-preview]').textContent,
		})),
		bodyTotal: document.querySelector('[data-body]').getAttribute('data-total'),
		historyTotal: document.querySelector('[data-history]').getAttribute('data-total'),
	}));
	assert.deepEqual(actual.body, oracle.bodyRows(config.bodyCount).slice(0, bodyCount));
	assert.deepEqual(actual.history, oracle.historyRows(config.historyCount).slice(0, historyCount));
	assert.equal(actual.bodyTotal, String(config.bodyCount));
	assert.equal(actual.historyTotal, String(config.historyCount));
}

function verifyTrace(trace, config) {
	assert.equal(trace.truncated, false, 'Server trace was truncated');
	assert.equal(
		trace.requests.length,
		1,
		'Hydration must not refetch the request-owned private data',
	);
	const events = trace.requests[0].events;
	assert.equal(
		events.filter(({ event }) => event === 'auth:start').length,
		1,
		'Body and history share one authorization dependency',
	);
	if (config.scenario === 'denied') {
		assert.equal(events.filter(({ event }) => event === 'auth:denied').length, 1);
		assert.ok(
			!events.some(({ event }) => event.startsWith('body:') || event.startsWith('history:')),
		);
		return;
	}
	const ready = events.findIndex(({ event }) => event === 'auth:ready');
	assert.ok(ready >= 0);
	for (const region of ['body', 'history']) {
		assert.equal(events.filter(({ event }) => event === `${region}:start`).length, 1);
		assert.ok(events.findIndex(({ event }) => event === `${region}:start`) > ready);
		const yields = events.filter(({ event }) => event === `${region}:yield`);
		assert.deepEqual(
			yields.map(({ revision }) => revision),
			Array.from({ length: config.waves }, (_, index) => index + 1),
		);
		assert.equal(yields.at(-1).count, config[`${region}Count`]);
		assert.equal(events.filter(({ event }) => event === `${region}:complete`).length, 1);
	}
}

async function runFlow(browser, server, oracle, scenario, causalGate, artifactDirectory, label) {
	const run = randomUUID();
	const config = oracle.scenarioConfig({ run, scenario, latency: 'delayed' });
	const groups = Object.fromEntries(
		['App', 'Composer', 'Body', 'History'].map((name) => [
			name.toLowerCase(),
			authoredChunks(server.graph, server.assets, name),
		]),
	);
	for (const file of groups.composer) {
		assert.ok(
			![...groups.app, ...groups.body, ...groups.history].includes(file),
			'Composer must have an independently releasable authored chunk',
		);
	}
	const context = await browser.newContext({
		viewport: { width: 1280, height: 900 },
		extraHTTPHeaders: {
			'x-conversation-bench': JSON.stringify(config),
		},
		serviceWorkers: 'block',
	});
	const page = await context.newPage();
	page.setDefaultTimeout(TIMEOUT);
	const requests = [];
	const byRequest = new Map();
	const errors = [];
	const held = new Map();
	const released = new Set();
	if (!causalGate) released.add('composer');
	let phase = 'startup';
	let closing = false;
	const started = performance.now();
	const result = { run, scenario, causalGate, label, config, requests, errors };
	const release = (name) => {
		released.add(name);
		for (const file of groups[name]) {
			for (const resume of held.get(file) ?? []) resume();
			held.delete(file);
		}
	};
	try {
		page.on('pageerror', (error) => errors.push({ kind: 'page', message: String(error) }));
		page.on('console', (message) => {
			if (
				message.type() === 'error' ||
				/hydration.*mismatch|mismatch.*hydrat/i.test(message.text())
			) {
				errors.push({ kind: 'console', message: message.text() });
			}
		});
		page.on('request', (request) => {
			const url = new URL(request.url());
			const file = decodeURIComponent(url.pathname).replace(/^\//, '');
			const row = {
				url: request.url(),
				type: request.resourceType(),
				phase,
				at: performance.now() - started,
				...(url.origin === server.origin && /\.(js|css)$/.test(file) ? { file } : {}),
			};
			requests.push(row);
			byRequest.set(request, row);
		});
		page.on('response', (response) => {
			const row = byRequest.get(response.request());
			if (row) row.status = response.status();
		});
		page.on('requestfinished', (request) => {
			const row = byRequest.get(request);
			if (row)
				Object.assign(row, { completedPhase: phase, completedAt: performance.now() - started });
		});
		page.on('requestfailed', (request) => {
			const row = byRequest.get(request);
			if (row)
				Object.assign(row, { failure: request.failure()?.errorText, intentionalCleanup: closing });
			if (!closing)
				errors.push({ kind: 'request', url: request.url(), message: request.failure()?.errorText });
		});
		await page.route('**/*', async (route) => {
			const file = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
			const blocked = Object.entries(groups).some(
				([name, files]) => files.includes(file) && !released.has(name),
			);
			if (blocked) {
				byRequest.get(route.request()).held = true;
				await new Promise((resolve) => held.set(file, [...(held.get(file) ?? []), resolve]));
			}
			try {
				if (closing) await route.abort();
				else if (causalGate && route.request().resourceType() === 'document') {
					await route.continue({
						headers: {
							...route.request().headers(),
							'x-conversation-bench': JSON.stringify({ ...config, holdAuth: true }),
						},
					});
				} else await route.continue();
			} catch (error) {
				if (!closing) errors.push({ kind: 'route', message: String(error) });
			}
		});
		await page.addInitScript(observePage);
		await page.goto(`${server.origin}/conversations`, { waitUntil: 'commit' });
		await page.locator('[data-public-shell]').waitFor({ state: 'visible' });
		if (causalGate) {
			await page.locator('[data-body-pending]').waitFor({ state: 'visible' });
			await page.locator('[data-history-pending]').waitFor({ state: 'visible' });
			assert.equal(await page.locator('[data-turn], [data-conversation]').count(), 0);
			const before = await context.request.get(`${server.origin}/__bench/trace?run=${run}`);
			assert.ok(before.ok());
			result.beforeAuthTrace = await before.json();
			assert.equal(result.beforeAuthTrace.requests.length, 1);
			assert.ok(
				!result.beforeAuthTrace.requests[0].events.some(
					({ event }) =>
						event === 'auth:ready' ||
						event === 'auth:denied' ||
						event.startsWith('body:') ||
						event.startsWith('history:'),
				),
			);
			result.publicShellBeforeAuth = true;
			const response = await context.request.post(
				`${server.origin}/__bench/release-auth?run=${run}`,
			);
			assert.ok(response.ok());
			assert.equal((await response.json()).released, 1);
		}
		await verifyRows(page, config, oracle, true);
		result.beforeActivationModules = await moduleLog(page);
		assertUnevaluated(result.beforeActivationModules, ['app', 'composer', 'body', 'history']);
		result.startup = deliveryPhases(requests, server.assets);
		await page.evaluate(() => {
			const state = window.__conversationBrowserBench;
			state.originalInput = document.querySelector('textarea[name="draft"]');
			state.originalBody = document.querySelector('[data-turn]');
			state.originalHistory = document.querySelector('[data-conversation]');
		});
		const earlyText = 'A native draft before hydration';
		phase = 'activation';
		await page.locator('textarea[name="draft"]').click();
		await page.keyboard.type(earlyText);
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('Shift+ArrowLeft');
		result.earlyInput = await page.locator('textarea[name="draft"]').evaluate((input) => ({
			value: input.value,
			start: input.selectionStart,
			end: input.selectionEnd,
			focused: document.activeElement === input,
		}));
		assert.equal(result.earlyInput.value, earlyText);
		assert.equal(result.earlyInput.focused, true);
		if (causalGate) {
			assertUnevaluated(await moduleLog(page), ['app', 'composer', 'body', 'history']);
			assert.ok(
				requests.some(({ file, held: blocked }) => groups.composer.includes(file) && blocked),
				'Native interaction must request the still-blocked composer',
			);
			release('composer');
		}
		await page.locator('[data-composer-ready="true"]').waitFor();
		await page.waitForFunction(
			(length) => document.querySelector('[data-draft-length]')?.textContent === String(length),
			earlyText.length,
		);
		result.afterComposer = await page.evaluate(() => {
			const input = document.querySelector('textarea[name="draft"]');
			return {
				value: input.value,
				start: input.selectionStart,
				end: input.selectionEnd,
				focused: document.activeElement === input,
				sameInput: input === window.__conversationBrowserBench.originalInput,
			};
		});
		assert.deepEqual(result.afterComposer, { ...result.earlyInput, sameInput: true });
		result.afterComposerModules = await moduleLog(page);
		assert.ok(result.afterComposerModules.includes('composer'));
		assertUnevaluated(result.afterComposerModules, ['app', 'body', 'history']);
		// This second native edit occurs after readiness and has no deliberate
		// network hold. Its DOM and next-rAF latencies are kept separate.
		await page
			.locator('textarea[name="draft"]')
			.evaluate((input) => input.setSelectionRange(input.value.length, input.value.length));
		await page.keyboard.type('!');
		await page.waitForFunction(
			() => window.__conversationBrowserBench.inputs.at(-1)?.raf !== undefined,
		);
		assert.equal(await page.locator('textarea[name="draft"]').inputValue(), earlyText + '!');
		assert.equal(
			await page.locator('[data-draft-length]').textContent(),
			String(earlyText.length + 1),
		);
		await page.locator('[data-composer-check]').click();
		await page.waitForFunction(
			(value) => document.querySelector('[data-composer-check-result]')?.textContent === value,
			earlyText + '!',
		);
		result.composerOnly = deliveryPhases(requests, server.assets);
		result.observations = await page.evaluate(() => {
			const { marks, regions, inputs, replayedInputs, activation } =
				window.__conversationBrowserBench;
			return { marks, regions, inputs, replayedInputs, activation };
		});
		phase = 'full-release';
		for (const name of Object.keys(groups)) release(name);
		await page.locator('[data-parent-ready="true"]').waitFor();
		if (scenario === 'denied') {
			await page.getByRole('heading', { name: 'Conversation', exact: true }).click();
			await page.getByRole('heading', { name: 'Recent conversations', exact: true }).click();
		} else {
			await page
				.locator('[data-turn]')
				.first()
				.getByRole('button', { name: 'Select turn' })
				.click();
			await page.waitForFunction(
				() => document.querySelector('[data-selected-turn]')?.textContent === 'turn-1',
			);
			await page
				.locator('[data-conversation]')
				.first()
				.getByRole('button', { name: 'Select conversation' })
				.click();
			await page.waitForFunction(
				() => document.querySelector('[data-selected-history]')?.textContent === 'conversation-1',
			);
		}
		await page.waitForFunction(() =>
			['app', 'composer', 'body', 'history'].every((name) =>
				window.__conversationBenchModules?.includes(name),
			),
		);
		await verifyRows(page, config, oracle);
		result.finalMarks = await page.evaluate(() => ({ ...window.__conversationBrowserBench.marks }));
		result.afterFullRelease = await page.evaluate(() => ({
			sameInput:
				document.querySelector('textarea[name="draft"]') ===
				window.__conversationBrowserBench.originalInput,
			sameBody:
				document.querySelector('[data-turn]') === window.__conversationBrowserBench.originalBody,
			sameHistory:
				document.querySelector('[data-conversation]') ===
				window.__conversationBrowserBench.originalHistory,
			draft: document.querySelector('textarea[name="draft"]').value,
		}));
		assert.deepEqual(result.afterFullRelease, {
			sameInput: true,
			sameBody: true,
			sameHistory: true,
			draft: earlyText + '!',
		});
		const response = await context.request.get(`${server.origin}/__bench/trace?run=${run}`);
		assert.ok(response.ok());
		result.serverTrace = await response.json();
		verifyTrace(result.serverTrace, config);
		const { marks, regions, inputs, activation } = result.observations;
		assert.ok(Number.isFinite(marks.shell));
		if (scenario !== 'denied') {
			assert.ok(marks.shell <= marks.body && marks.shell <= marks.history);
			const first = scenario === 'history-first' ? 'history' : 'body';
			const second = first === 'history' ? 'body' : 'history';
			result.independentRegionObserved = regions.some(
				(state) => state[first] > 0 && state[second] === 0,
			);
			if (causalGate)
				assert.ok(
					result.independentRegionObserved,
					`${first} must be useful independently of ${second}`,
				);
		}
		assert.ok(
			inputs.length > 1 && inputs.every((input) => input.trusted),
			'Native input observations are required',
		);
		const lastInput = inputs.at(-1);
		result.metrics = {
			shell_dom_ms: marks.shell,
			...(scenario === 'denied' ? {} : { body_dom_ms: marks.body, history_dom_ms: marks.history }),
			...(causalGate ? {} : { composer_activation_dom_ms: marks.composerReady - activation }),
			input_to_derived_dom_ms: lastInput.derived - lastInput.at,
			input_to_derived_raf_ms: lastInput.raf - lastInput.at,
			...(config.waves > 1
				? {
						body_activation_catchup_dom_ms:
							result.finalMarks.bodyComplete - result.finalMarks.bodyActivation,
						history_activation_catchup_dom_ms:
							result.finalMarks.historyComplete - result.finalMarks.historyActivation,
					}
				: {}),
		};
		for (const value of Object.values(result.metrics))
			assert.ok(Number.isFinite(value) && value >= 0);
		assert.deepEqual(errors, []);
		assert.ok(
			!requests.some(({ status }) => status >= 400),
			'A page resource returned an HTTP error',
		);
		result.correctness = 'passed';
	} catch (error) {
		result.correctness = 'failed';
		result.error = String(error.stack ?? error);
		await page
			.screenshot({ path: path.join(artifactDirectory, `${label}-failure.png`), fullPage: true })
			.catch(() => {});
	} finally {
		try {
			result.delivery = deliveryPhases(requests, server.assets);
		} catch (error) {
			result.correctness = 'failed';
			result.error ??= String(error.stack ?? error);
		}
		closing = true;
		for (const name of Object.keys(groups)) release(name);
		try {
			await context.close();
		} finally {
			fs.writeFileSync(
				path.join(artifactDirectory, `${label}.json`),
				JSON.stringify(result, null, 2) + '\n',
			);
		}
	}
	return result;
}

/** Optional real-browser benchmark. The caller supplies an already-built fixture. */
export async function runBrowserBenchmark({
	buildDirectory,
	iterations = 10,
	browserName = 'webkit',
	scenarios = SCENARIOS,
	playwright,
} = {}) {
	assert.equal(
		browserName,
		'webkit',
		'This browser harness explicitly supports WebKit; it never substitutes Chromium or branded Safari',
	);
	assert.ok(
		Number.isSafeInteger(iterations) && iterations > 0,
		'Expected a positive iteration count',
	);
	assert.ok(
		scenarios.length > 0 &&
			new Set(scenarios).size === scenarios.length &&
			scenarios.every((scenario) => SCENARIOS.includes(scenario)),
		'Expected distinct supported scenarios',
	);
	assert.ok(
		buildDirectory && path.isAbsolute(buildDirectory),
		'--build-dir must name an absolute prebuilt artifact directory',
	);
	const relative = path.relative(path.resolve(import.meta.dirname, '../..'), buildDirectory);
	assert.ok(
		relative.startsWith('..' + path.sep) || path.isAbsolute(relative),
		'Keep generated browser evidence outside the repository',
	);
	const built = readBuild(buildDirectory);
	const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
	assert.equal(
		hash(path.join(built.root, 'src/data.mjs')),
		built.provenance.fixtureHashes['src/data.mjs'],
		'The built fixture payload oracle changed',
	);
	const oracle = await import(pathToFileURL(path.join(built.root, 'src/data.mjs')));
	const artifactDirectory = fs.mkdtempSync(path.join(buildDirectory, 'browser-'));
	const payload = {
		suite: 'conversation-streaming-browser',
		iterations,
		scenarios,
		warmup: WARMUP,
		browser: { name: 'webkit', brandedSafari: false },
		environment: measurementEnvironment(),
		artifactDirectory,
		provenance: {
			...built.provenance,
			browserRunnerSha256: hash(import.meta.filename),
			statisticsSha256: hash(path.resolve(import.meta.dirname, '../lib/stats.mjs')),
		},
		policy: {
			samples:
				'Fresh browser context and cold cache per flow; five discarded warmup flows per scenario in one browser process. Fixed scenario order; compare matched repeat processes, not a single run.',
			initial:
				'Navigation-time first-snapshot DOM presence under the ordinary delayed authorization schedule. Later query yields update live signal state, not dormant HTML; multi-wave activation catch-up is separate. MutationObserver overhead is included. Not paint or HTTP TTFB.',
			activation:
				'First native focus to the composer layout-effect readiness marker with its normal network path. Parent/body/history modules remain deliberately held.',
			input:
				'Post-readiness trusted native input to matching derived DOM, and separately the next matching requestAnimationFrame. Replayed events are recorded separately. Zero-duration samples may be below browser clock resolution, not zero work. Not paint, INP, native IME or device performance.',
			gates:
				'Separate untimed auth-release/composer-hold flows prove visible placeholders before auth and native input adoption before composer code. Their artificial delays never enter the timing summaries.',
			requests:
				'Controller-side monotonic request/completion timeline and disjoint unique physical JS/CSS phases; not transferred bandwidth. Routing disables browser HTTP cache.',
			statistics:
				'Maintained selected late-window scores plus distribution statistics. Small samples/overlapping repeats do not establish a speedup.',
		},
		targets: [{ name: 'octane-webkit', ops: {}, meta: { semanticGates: [], flows: [] } }],
		rawSamples: {},
	};
	let server;
	let browser;
	try {
		const driver = playwright ?? (await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright'));
		assert.ok(driver.webkit, 'The selected Playwright module must provide WebKit');
		server = await startServer(buildDirectory);
		browser = await driver.webkit.launch({ headless: true });
		payload.browser.version = browser.version();
		for (const scenario of scenarios) {
			console.error(`checking octane-webkit/${scenario} (untimed causal gate)…`);
			const gate = await runFlow(
				browser,
				server,
				oracle,
				scenario,
				true,
				artifactDirectory,
				`${scenario}-gate`,
			);
			payload.targets[0].meta.semanticGates.push({
				scenario,
				correctness: gate.correctness,
				artifact: `${scenario}-gate.json`,
			});
			assert.equal(gate.correctness, 'passed', gate.error);
			console.error(
				`running octane-webkit/${scenario} (${WARMUP} warmup + ${iterations} measured flows)…`,
			);
			for (let index = 0; index < WARMUP + iterations; index++) {
				const label = `${scenario}-${index < WARMUP ? 'warmup' : 'sample'}-${index < WARMUP ? index : index - WARMUP}`;
				const flow = await runFlow(
					browser,
					server,
					oracle,
					scenario,
					false,
					artifactDirectory,
					label,
				);
				payload.targets[0].meta.flows.push({
					scenario,
					warmup: index < WARMUP,
					artifact: `${label}.json`,
					correctness: flow.correctness,
				});
				assert.equal(flow.correctness, 'passed', flow.error);
				if (index < WARMUP) continue;
				for (const [metric, value] of Object.entries(flow.metrics)) {
					const operation = `${scenario.replaceAll('-', '_')}_${metric}`;
					(payload.rawSamples[operation] ??= []).push(value);
				}
			}
		}
		for (const [operation, samples] of Object.entries(payload.rawSamples)) {
			assert.equal(samples.length, iterations);
			payload.targets[0].ops[operation] = timingStatForJson(summarizeSamples(samples));
		}
		readBuild(buildDirectory);
		assert.equal(
			hash(import.meta.filename),
			payload.provenance.browserRunnerSha256,
			'Browser runner changed during measurement',
		);
		assert.equal(
			hash(path.resolve(import.meta.dirname, '../lib/stats.mjs')),
			payload.provenance.statisticsSha256,
			'Statistics changed during measurement',
		);
	} catch (error) {
		payload.failed = String(error.stack ?? error);
	} finally {
		try {
			await browser?.close();
		} finally {
			try {
				await server?.close();
			} finally {
				fs.writeFileSync(
					path.join(artifactDirectory, 'report.json'),
					JSON.stringify(payload, null, 2) + '\n',
				);
				if (process.env.BENCH_JSON) {
					fs.mkdirSync(path.dirname(path.resolve(process.env.BENCH_JSON)), { recursive: true });
					fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
				}
			}
		}
	}
	console.log(
		JSON.stringify(
			{ artifactDirectory, failed: payload.failed ?? false, ops: payload.targets[0].ops },
			null,
			2,
		),
	);
	return payload;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
	const args = process.argv.slice(2);
	assert.ok(
		args.every(
			(arg) => /^\d+$/.test(arg) || arg.startsWith('--build-dir=') || arg === '--browser=webkit',
		),
		'Usage: run-browser.mjs [iterations] --build-dir=/absolute/artifacts --browser=webkit',
	);
	assert.ok(args.filter((arg) => /^\d+$/.test(arg)).length <= 1);
	const result = await runBrowserBenchmark({
		buildDirectory: args
			.find((arg) => arg.startsWith('--build-dir='))
			?.slice('--build-dir='.length),
		iterations: Number(args.find((arg) => /^\d+$/.test(arg)) ?? 10),
		browserName: 'webkit',
	});
	if (result.failed) process.exitCode = 1;
}
