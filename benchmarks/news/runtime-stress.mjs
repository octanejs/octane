process.env.NODE_ENV = 'production';

import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build } from 'vite';
import {
	FORM_FIELD_COUNT,
	LIFECYCLE_CYCLES_PER_SAMPLE,
	LIFECYCLE_ROW_COUNT,
	STORE_SUBSCRIBER_COUNT,
} from '../runtime-stress/shared.js';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGETS = ['octane-tsrx', 'react', 'preact', 'solid', 'svelte', 'vue-vapor'];
const SUITES = ['lifecycle-memory', 'controlled-form', 'external-store-fanout'];
const suite = process.env.OCTANE_RUNTIME_STRESS_SUITE;
const args = process.argv.slice(2);
const positional = args.filter((value) => !value.startsWith('--'));
const target = TARGETS.includes(positional[0]) ? positional.shift() : 'octane-tsrx';
const iterations = Number.parseInt(positional[0] ?? '5', 10);

if (!SUITES.includes(suite)) throw new Error(`Unknown runtime stress suite: ${suite}`);
if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Runtime stress iterations must be a positive integer');
}

const appDirectory = path.join(HERE, target);
const clientDirectory = path.join(appDirectory, 'dist/runtime-stress');
const clientHtml = path.join(clientDirectory, 'runtime-stress.html');

if (!args.includes('--no-build')) {
	console.log(`Building ${target} runtime stress fixture (production)…`);
	await build({
		root: appDirectory,
		logLevel: 'warn',
		build: {
			outDir: path.relative(appDirectory, clientDirectory),
			emptyOutDir: true,
			minify: 'esbuild',
			rollupOptions: {
				input: path.join(appDirectory, 'runtime-stress.html'),
				output: {
					chunkFileNames: 'assets/[name]-[hash].js',
					entryFileNames: 'assets/[name]-[hash].js',
				},
			},
		},
	});
}

if (!fs.existsSync(clientHtml)) {
	throw new Error(`Missing production runtime stress assets for ${target}`);
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
	throw new Error('The runtime stress server did not expose a TCP port');
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
	const cdp = await context.newCDPSession(page);
	await page.goto(origin, { waitUntil: 'domcontentloaded' });
	try {
		await page.waitForFunction(() => window.__runtimeStress?.ready === true, null, {
			timeout: 10_000,
		});
	} catch (error) {
		const details = failures.length > 0 ? failures.join('; ') : 'bootstrap never became ready';
		await context.close();
		throw new Error(`${target}: production runtime stress fixture failed to start: ${details}`, {
			cause: error,
		});
	}
	ensure(failures.length === 0, `production browser errors: ${failures.join('; ')}`);
	return { cdp, context, failures, page };
}

async function runLifecycleSample() {
	const sample = await openSample();
	const { cdp, page } = sample;
	try {
		await cdp.send('HeapProfiler.collectGarbage');
		const beforeHeap = await cdp.send('Runtime.getHeapUsage');
		const mountSamples = [];
		const updateSamples = [];
		const unmountSamples = [];

		for (let index = 0; index < LIFECYCLE_CYCLES_PER_SAMPLE; index++) {
			const mountedAt = await page.evaluate(() => performance.now());
			await page.locator('#lifecycle-toggle').click();
			await page.waitForFunction(
				({ count, mounts }) =>
					document.querySelectorAll('[data-lifecycle-row]').length === count &&
					window.__runtimeStress.stats.lifecycle.mounts === mounts,
				{ count: LIFECYCLE_ROW_COUNT, mounts: (index + 1) * LIFECYCLE_ROW_COUNT },
			);
			mountSamples.push((await page.evaluate(() => performance.now())) - mountedAt);

			const updatedAt = await page.evaluate(() => performance.now());
			await page.locator('#lifecycle-update').click();
			await page.waitForFunction(
				({ count, mounts, cleanups, tick }) => {
					const rows = Array.from(document.querySelectorAll('[data-lifecycle-row]'));
					const lifecycle = window.__runtimeStress.stats.lifecycle;
					return (
						rows.length === count &&
						rows.every((row, rowIndex) => row.textContent === `${rowIndex}:${tick}`) &&
						lifecycle.mounts === mounts &&
						lifecycle.cleanups === cleanups &&
						window.__runtimeStress.store.size === count
					);
				},
				{
					count: LIFECYCLE_ROW_COUNT,
					mounts: (index + 1) * LIFECYCLE_ROW_COUNT,
					cleanups: index * LIFECYCLE_ROW_COUNT,
					tick: index + 1,
				},
			);
			updateSamples.push((await page.evaluate(() => performance.now())) - updatedAt);

			if (index === 0) {
				const received = await page.evaluate(() => {
					const lifecycle = window.__runtimeStress.stats.lifecycle;
					const before = lifecycle.probeEvents;
					document.dispatchEvent(new Event('octane-runtime-stress-probe'));
					return lifecycle.probeEvents - before;
				});
				ensure(received === LIFECYCLE_ROW_COUNT, 'mounted listeners missed the native probe');
			}

			const unmountedAt = await page.evaluate(() => performance.now());
			await page.locator('#lifecycle-toggle').click();
			await page.waitForFunction(
				(cleanups) =>
					document.querySelectorAll('[data-lifecycle-row]').length === 0 &&
					window.__runtimeStress.stats.lifecycle.cleanups === cleanups,
				(index + 1) * LIFECYCLE_ROW_COUNT,
			);
			unmountSamples.push((await page.evaluate(() => performance.now())) - unmountedAt);
		}

		const state = await page.evaluate(() => {
			const lifecycle = window.__runtimeStress.stats.lifecycle;
			const before = lifecycle.probeEvents;
			document.dispatchEvent(new Event('octane-runtime-stress-probe'));
			return {
				...lifecycle,
				retainedProbeListeners: lifecycle.probeEvents - before,
				retainedRows: document.querySelectorAll('[data-lifecycle-row]').length,
				retainedStoreSubscribers: window.__runtimeStress.store.size,
			};
		});
		const expected = LIFECYCLE_ROW_COUNT * LIFECYCLE_CYCLES_PER_SAMPLE;
		ensure(state.mounts === expected, `expected ${expected} mounted lifecycle effects`);
		ensure(state.cleanups === expected, 'a lifecycle effect was not cleaned up exactly once');
		ensure(state.listenerAdds === state.listenerRemoves, 'a real DOM listener was retained');
		ensure(
			state.subscriptionsCreated === state.subscriptionsCleared,
			'a lifecycle external-store subscription was retained',
		);
		ensure(state.timersCreated === state.timersCleared, 'a real interval was retained');
		ensure(state.retainedRows === 0, 'unmounted component DOM was retained');
		ensure(state.retainedStoreSubscribers === 0, 'an unmounted row retained a store listener');
		ensure(state.retainedProbeListeners === 0, 'an unmounted listener handled the event probe');
		ensure(sample.failures.length === 0, sample.failures.join('; '));
		await cdp.send('HeapProfiler.collectGarbage');
		const afterHeap = await cdp.send('Runtime.getHeapUsage');

		return {
			ops: {
				mount: mountSamples.reduce((sum, value) => sum + value, 0) / mountSamples.length,
				update: updateSamples.reduce((sum, value) => sum + value, 0) / updateSamples.length,
				unmount: unmountSamples.reduce((sum, value) => sum + value, 0) / unmountSamples.length,
				cycle:
					[...mountSamples, ...updateSamples, ...unmountSamples].reduce(
						(sum, value) => sum + value,
						0,
					) / mountSamples.length,
			},
			meta: {
				...state,
				cycles: LIFECYCLE_CYCLES_PER_SAMPLE,
				heapAfterGc: afterHeap.usedSize,
				heapBeforeGc: beforeHeap.usedSize,
				heapDeltaAfterGc: afterHeap.usedSize - beforeHeap.usedSize,
			},
		};
	} finally {
		await sample.context.close();
	}
}

async function runFormSample() {
	const sample = await openSample();
	const { page } = sample;
	try {
		await page.waitForFunction(
			(count) => document.querySelectorAll('input[data-field-index]').length === count,
			FORM_FIELD_COUNT,
		);
		const input = page.locator('input[data-field-index="37"]');
		await input.click();
		await page.evaluate(() => {
			window.__runtimeStress.originalInput = document.querySelector('input[data-field-index="37"]');
		});
		const typingStarted = await page.evaluate(() => performance.now());
		await input.pressSequentially('octane benchmark');
		await input.press('ArrowLeft');
		await input.press('ArrowLeft');
		await input.press('X');
		const expected = 'octane benchmaXrk';
		await page.waitForFunction(
			(value) =>
				document.querySelector('input[data-field-index="37"]')?.value === value &&
				document.querySelector('[data-field-output="37"]')?.textContent === value,
			expected,
		);
		const typed = await page.evaluate(() => {
			const input = document.querySelector('input[data-field-index="37"]');
			return {
				completedAt: performance.now(),
				focused: document.activeElement === input,
				inputSame: input === window.__runtimeStress.originalInput,
				selectionEnd: input.selectionEnd,
				selectionStart: input.selectionStart,
				value: input.value,
			};
		});
		ensure(typed.inputSame, 'a controlled update replaced the focused input');
		ensure(typed.focused, 'controlled typing moved input focus');
		ensure(
			typed.selectionStart === expected.length - 2 && typed.selectionEnd === expected.length - 2,
			'controlled typing moved the insertion caret',
		);

		const controlsStarted = await page.evaluate(() => performance.now());
		await page.locator('#form-checkbox').check();
		await page.locator('#form-radio-express').check();
		await page.locator('#form-select').selectOption('team');
		await page.locator('#form-conditional-toggle').click();
		await page.waitForSelector('#form-conditional');
		await page.locator('#form-submit').click();
		await page.waitForFunction(() => window.__runtimeStress.stats.form.submits === 1);
		await page.waitForFunction(() => {
			const form = window.__runtimeStress.stats.form;
			return form.validationApplied + form.validationStale === form.validationRequests;
		});
		const submitted = await page.evaluate(() => {
			const form = window.__runtimeStress.stats.form;
			return {
				completedAt: performance.now(),
				fieldCount: document.querySelectorAll('input[data-field-index]').length,
				lastSubmission: form.lastSubmission,
				lastValidated: form.lastValidated,
				submissionFields: Object.keys(form.lastSubmission).length,
				validationApplied: form.validationApplied,
				validationRequests: form.validationRequests,
				validationStale: form.validationStale,
				fieldRenders: form.fieldRenders,
			};
		});
		ensure(submitted.fieldCount === FORM_FIELD_COUNT, 'the controlled form dropped a field');
		ensure(submitted.lastSubmission['field-37'] === expected, 'submit received the wrong draft');
		ensure(
			submitted.lastSubmission.notifications === 'enabled',
			'checkbox state was not submitted',
		);
		ensure(submitted.lastSubmission.delivery === 'express', 'radio state was not submitted');
		ensure(submitted.lastSubmission.audience === 'team', 'select state was not submitted');
		ensure(
			submitted.submissionFields === FORM_FIELD_COUNT + 3,
			'the submitted FormData omitted or duplicated controlled fields',
		);
		ensure(submitted.validationStale > 0, 'rapid typing did not exercise stale validation');
		ensure(submitted.lastValidated === expected, 'stale validation overwrote the latest draft');

		const resetStarted = await page.evaluate(() => performance.now());
		await page.locator('#form-reset').click();
		try {
			await page.waitForFunction(
				(count) =>
					document.querySelectorAll('input[data-field-index]').length === count &&
					document.querySelector('input[data-field-index="37"]')?.value === '' &&
					document.querySelector('[data-field-output="37"]')?.textContent === '' &&
					!document.querySelector('#form-checkbox')?.checked &&
					document.querySelector('#form-select')?.value === 'personal' &&
					!document.querySelector('#form-conditional'),
				FORM_FIELD_COUNT,
				{ timeout: 10_000 },
			);
		} catch (error) {
			const actual = await page.evaluate(() => ({
				checkbox: document.querySelector('#form-checkbox')?.checked,
				conditional: Boolean(document.querySelector('#form-conditional')),
				fieldCount: document.querySelectorAll('input[data-field-index]').length,
				output: document.querySelector('[data-field-output="37"]')?.textContent,
				select: document.querySelector('#form-select')?.value,
				value: document.querySelector('input[data-field-index="37"]')?.value,
			}));
			throw new Error(
				`${target}: form reset did not restore all controls: ${JSON.stringify(actual)}`,
				{
					cause: error,
				},
			);
		}
		const resetCompleted = await page.evaluate(() => performance.now());
		ensure(sample.failures.length === 0, sample.failures.join('; '));

		return {
			ops: {
				typing: typed.completedAt - typingStarted,
				controls_submit: submitted.completedAt - controlsStarted,
				reset: resetCompleted - resetStarted,
			},
			meta: {
				fieldCount: submitted.fieldCount,
				fieldRenders: submitted.fieldRenders,
				focused: typed.focused,
				inputSame: typed.inputSame,
				lastValidated: submitted.lastValidated,
				selectionEnd: typed.selectionEnd,
				selectionStart: typed.selectionStart,
				submissionFields: submitted.submissionFields,
				validationApplied: submitted.validationApplied,
				validationRequests: submitted.validationRequests,
				validationStale: submitted.validationStale,
			},
		};
	} finally {
		await sample.context.close();
	}
}

async function runStoreSample() {
	const sample = await openSample();
	const { page } = sample;
	try {
		const mountStarted = await page.evaluate(() => performance.now());
		await page.locator('#store-toggle').click();
		await page.waitForFunction(
			(count) =>
				document.querySelectorAll('[data-subscriber-index]').length === count &&
				window.__runtimeStress.store.size === count,
			STORE_SUBSCRIBER_COUNT,
		);
		const mountedAt = await page.evaluate(() => performance.now());

		const narrowStarted = await page.evaluate(() => performance.now());
		await page.locator('#store-narrow').click();
		await page.waitForFunction(
			() => document.querySelector('[data-subscriber-index="17"]')?.textContent === '1',
		);
		const narrow = await page.evaluate(() => {
			const changed = Array.from(document.querySelectorAll('[data-subscriber-index]'))
				.filter((node) => node.textContent !== '0')
				.map((node) => Number(node.getAttribute('data-subscriber-index')));
			return { changed, completedAt: performance.now() };
		});
		ensure(
			narrow.changed.length === 1 && narrow.changed[0] === 17,
			'a narrow store write changed the wrong visible subscribers',
		);

		const broadStarted = await page.evaluate(() => performance.now());
		await page.locator('#store-broad').click();
		await page.waitForFunction(
			(count) =>
				document.querySelectorAll('[data-subscriber-index]').length === count &&
				Array.from(document.querySelectorAll('[data-subscriber-index]')).every(
					(node) => node.textContent === '7',
				),
			STORE_SUBSCRIBER_COUNT,
		);
		const broadAt = await page.evaluate(() => performance.now());

		const rapidStarted = await page.evaluate(() => performance.now());
		await page.locator('#store-rapid').click();
		await page.waitForFunction(
			(count) =>
				document.querySelectorAll('[data-subscriber-index]').length === count &&
				Array.from(document.querySelectorAll('[data-subscriber-index]')).every(
					(node, index) => node.textContent === (index === 17 ? '10' : '7'),
				),
			STORE_SUBSCRIBER_COUNT,
		);
		const rapidAt = await page.evaluate(() => performance.now());

		const unmountStarted = await page.evaluate(() => performance.now());
		await page.locator('#store-toggle').click();
		await page.waitForFunction(
			() =>
				document.querySelectorAll('[data-subscriber-index]').length === 0 &&
				window.__runtimeStress.store.size === 0,
		);
		const state = await page.evaluate(() => ({
			completedAt: performance.now(),
			...window.__runtimeStress.stats.store,
			retainedSubscribers: window.__runtimeStress.store.size,
		}));
		ensure(state.subscribeCalls >= STORE_SUBSCRIBER_COUNT, 'subscribers never connected');
		ensure(
			state.subscribeCalls === state.unsubscribeCalls,
			'an external-store subscription was not cleaned up exactly once',
		);
		ensure(state.retainedSubscribers === 0, 'the store retained an unmounted subscriber');
		ensure(state.notifications >= STORE_SUBSCRIBER_COUNT * 3, 'store notifications were lost');
		ensure(sample.failures.length === 0, sample.failures.join('; '));

		return {
			ops: {
				mount: mountedAt - mountStarted,
				narrow_write: narrow.completedAt - narrowStarted,
				broad_write: broadAt - broadStarted,
				rapid_writes: rapidAt - rapidStarted,
				unmount: state.completedAt - unmountStarted,
			},
			meta: {
				notifications: state.notifications,
				retainedSubscribers: state.retainedSubscribers,
				renders: state.renders,
				snapshotCalls: state.snapshotCalls,
				subscribeCalls: state.subscribeCalls,
				subscriberCount: STORE_SUBSCRIBER_COUNT,
				unsubscribeCalls: state.unsubscribeCalls,
			},
		};
	} finally {
		await sample.context.close();
	}
}

const runSample = {
	'lifecycle-memory': runLifecycleSample,
	'controlled-form': runFormSample,
	'external-store-fanout': runStoreSample,
}[suite];
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
	suite,
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
	console.error(`FAIL ${suite}/${target}: ${failure}`);
	process.exitCode = 1;
} else {
	console.log(`PASS ${suite}/${target}: ${iterations} correctness-gated Chromium samples`);
	console.table(
		Object.fromEntries(
			Object.entries(payload.targets[0].ops).map(([name, stats]) => [
				name,
				{ 'score (ms)': stats.score, 'p95 (ms)': stats.p95, samples: stats.samples },
			]),
		),
	);
}
