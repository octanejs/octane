// Deterministic production event work over the existing 512-field application.
// This is intentionally separate from run.mjs so temporary intrinsic observers
// cannot distort the ordinary event-delegation timing benchmark.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const requireFromNews = createRequire(new URL('../news/package.json', import.meta.url));
const { chromium } = requireFromNews('playwright');
const appDirectory = fileURLToPath(new URL('../news/octane-tsrx/', import.meta.url));
const EVENTS = 128;
const FIELDS = 512;
const failures = [];

let browser;
let productionServer;
let observed;
try {
	let target = process.env.EVENT_URL;
	if (!target) {
		const { build, preview } = await import(pathToFileURL(requireFromNews.resolve('vite')).href);
		await build({
			root: appDirectory,
			logLevel: 'error',
			build: {
				outDir: 'dist/runtime-stress',
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
		productionServer = await preview({
			root: appDirectory,
			logLevel: 'error',
			build: { outDir: 'dist/runtime-stress' },
			preview: { host: '127.0.0.1', port: 0, strictPort: true },
		});
		const address = productionServer.httpServer.address();
		if (address === null || typeof address === 'string') {
			throw new Error('The production event fixture did not expose a TCP port');
		}
		target = `http://127.0.0.1:${address.port}/runtime-stress.html`;
	}

	browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--no-sandbox'],
	});
	const page = await browser.newPage();
	await page.goto(target, { waitUntil: 'load' });
	await page.waitForFunction(() => globalThis.__runtimeStress?.ready === true, null, {
		timeout: 10_000,
	});
	observed = await page.evaluate(
		({ events, fields }) => {
			const form = document.querySelector('#stress-form');
			if (form === null) throw new Error('Missing controlled benchmark form');
			if (document.querySelectorAll('input[data-field-index]').length !== fields) {
				throw new Error('The application did not mount its complete controlled form');
			}

			const originalDefineProperty = Object.defineProperty;
			const originalPush = Array.prototype.push;
			const setInputValue = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				'value',
			).set;
			const descriptors = new Set();
			const getters = new Set();
			const possiblePaths = new WeakSet();
			const capturePaths = new Set();
			let currentInput = null;
			let definitions = 0;
			let nativeCaptures = 0;
			let nativeBubbles = 0;
			let frameworkCaptures = 0;
			let invalidCurrentTargets = 0;
			const capture = () => nativeCaptures++;
			const bubble = () => nativeBubbles++;

			document.addEventListener('input', capture, true);
			document.addEventListener('input', bubble);
			globalThis.__octaneDelegatedInputCapture = (event) => {
				frameworkCaptures++;
				if (event.currentTarget !== form || event.target !== currentInput) {
					invalidCurrentTargets++;
				}
			};
			Object.defineProperty = function (target, key, descriptor) {
				if (target instanceof Event && key === 'currentTarget') {
					definitions++;
					descriptors.add(descriptor);
					if (typeof descriptor.get === 'function') getters.add(descriptor.get);
				}
				return originalDefineProperty.call(Object, target, key, descriptor);
			};
			Array.prototype.push = function (...values) {
				if (currentInput !== null && values.length === 1) {
					if (values[0] === currentInput && this.length === 0) {
						possiblePaths.add(this);
					} else if (values[0] === currentInput.parentNode && possiblePaths.has(this)) {
						capturePaths.add(this);
					}
				}
				return originalPush.apply(this, values);
			};

			try {
				for (let index = 0; index < events; index++) {
					currentInput = document.querySelector(`input[data-field-index="${index}"]`);
					setInputValue.call(currentInput, `event-${index}`);
					currentInput.dispatchEvent(
						new InputEvent('input', { bubbles: true, data: String(index) }),
					);
					currentInput = null;
				}
			} finally {
				currentInput = null;
				Object.defineProperty = originalDefineProperty;
				Array.prototype.push = originalPush;
				document.removeEventListener('input', capture, true);
				document.removeEventListener('input', bubble);
				delete globalThis.__octaneDelegatedInputCapture;
			}

			let updatedFields = 0;
			let updatedOutputs = 0;
			for (let index = 0; index < events; index++) {
				const expected = `event-${index}`;
				if (document.querySelector(`input[data-field-index="${index}"]`)?.value === expected) {
					updatedFields++;
				}
				if (document.querySelector(`[data-field-output="${index}"]`)?.textContent === expected) {
					updatedOutputs++;
				}
			}
			return {
				eventHosts: document.querySelectorAll('input[data-field-index]').length,
				events,
				nativeCaptures,
				nativeBubbles,
				frameworkCaptures,
				invalidCurrentTargets,
				updatedFields,
				updatedOutputs,
				definitions,
				descriptors: descriptors.size,
				getters: getters.size,
				capturePaths: capturePaths.size,
			};
		},
		{ events: EVENTS, fields: FIELDS },
	);
} finally {
	try {
		await browser?.close();
	} finally {
		await productionServer?.close();
	}
}

for (const key of [
	'nativeCaptures',
	'nativeBubbles',
	'frameworkCaptures',
	'updatedFields',
	'updatedOutputs',
]) {
	if (observed[key] !== EVENTS) failures.push(`${key}: ${observed[key]} is not ${EVENTS}`);
}
if (observed.eventHosts !== FIELDS)
	failures.push(`eventHosts: ${observed.eventHosts} is not ${FIELDS}`);
if (observed.invalidCurrentTargets !== 0) {
	failures.push(`invalidCurrentTargets: ${observed.invalidCurrentTargets} is not zero`);
}
if (observed.definitions !== EVENTS * 2) {
	failures.push(`definitions: ${observed.definitions} is not ${EVENTS * 2}`);
}
for (const key of ['descriptors', 'getters', 'capturePaths']) {
	if (observed[key] > 1) failures.push(`${key}: ${observed[key]} exceeds 1`);
}

console.log('Production delegated-event work:');
console.table(observed);
if (process.env.BENCH_JSON) {
	const stat = (value) => ({ median: value, min: value, samples: 1 });
	fs.writeFileSync(
		process.env.BENCH_JSON,
		JSON.stringify(
			{
				suite: 'event-delegation-work',
				targets: [
					{
						name: 'octane-tsrx-work',
						ops: Object.fromEntries(
							Object.entries(observed).map(([name, value]) => [name, stat(value)]),
						),
						meta: { gate: failures.length === 0 ? 'passed' : 'failed' },
					},
				],
				...(failures.length === 0 ? {} : { failed: failures.join('; ') }),
			},
			null,
			'\t',
		) + '\n',
	);
}
if (failures.length > 0) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exitCode = 1;
} else {
	console.log('All deterministic delegated-event allocation gates passed.');
}
