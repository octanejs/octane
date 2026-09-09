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
const PORTAL_CYCLES = 3;
const failures = [];

let browser;
let productionServer;
let observed;
let noCaptureObserved;
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
					input: [
						path.join(appDirectory, 'event-work.html'),
						path.join(appDirectory, 'event-work-no-capture.html'),
					],
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
		target = `http://127.0.0.1:${address.port}/event-work.html`;
	}

	browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--no-sandbox'],
	});
	const page = await browser.newPage();
	await page.goto(target, { waitUntil: 'load' });
	await page.waitForFunction(
		() =>
			globalThis.__runtimeStress?.ready === true &&
			typeof globalThis.__eventWorkPortalLifecycle === 'function',
		null,
		{
			timeout: 10_000,
		},
	);
	observed = await page.evaluate(
		({ events, fields, portalCycles }) => {
			const form = document.querySelector('#stress-form');
			if (form === null) throw new Error('Missing controlled benchmark form');
			if (document.querySelectorAll('input[data-field-index]').length !== fields) {
				throw new Error('The application did not mount its complete controlled form');
			}
			// Mount through compiled JSX child position, not a createElement value
			// portal. After its owner unmounts, ordinary input work must be portal-free.
			const portalLifecycle = globalThis.__eventWorkPortalLifecycle(portalCycles);

			const originalDefineProperty = Object.defineProperty;
			const originalPush = Array.prototype.push;
			const originalComposedPath = Event.prototype.composedPath;
			const originalPreviousSibling = Object.getOwnPropertyDescriptor(
				Node.prototype,
				'previousSibling',
			);
			const originalComparePosition = Node.prototype.compareDocumentPosition;
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
			let previousSiblingReads = 0;
			let documentPositionComparisons = 0;
			let inputComposedPaths = 0;
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
			Event.prototype.composedPath = function () {
				if (currentInput !== null && this.target === currentInput) inputComposedPaths++;
				return originalComposedPath.call(this);
			};
			Object.defineProperty(Node.prototype, 'previousSibling', {
				...originalPreviousSibling,
				get() {
					previousSiblingReads++;
					return originalPreviousSibling.get.call(this);
				},
			});
			Node.prototype.compareDocumentPosition = function (node) {
				documentPositionComparisons++;
				return originalComparePosition.call(this, node);
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
				Event.prototype.composedPath = originalComposedPath;
				Object.defineProperty(Node.prototype, 'previousSibling', originalPreviousSibling);
				Node.prototype.compareDocumentPosition = originalComparePosition;
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
				...portalLifecycle,
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
				inputComposedPaths,
				previousSiblingReads,
				documentPositionComparisons,
			};
		},
		{ events: EVENTS, fields: FIELDS, portalCycles: PORTAL_CYCLES },
	);
	// A second browser context loads only the controlled-input module. Importing
	// the ordinary App here would register onInputCapture for this runtime copy
	// before any event is dispatched, even if its handler value were undefined.
	const noCapturePage = await browser.newPage();
	await noCapturePage.goto(new URL('event-work-no-capture.html', target).href, {
		waitUntil: 'load',
	});
	await noCapturePage.waitForFunction(() => globalThis.__runtimeStress?.ready === true, null, {
		timeout: 10_000,
	});
	noCaptureObserved = await noCapturePage.evaluate(
		({ events, fields }) => {
			const form = document.querySelector('#stress-form');
			const media = document.querySelector('#event-work-media');
			if (form === null || document.querySelectorAll('input[data-field-index]').length !== fields) {
				throw new Error('Missing controlled no-capture benchmark form');
			}
			if (media === null) throw new Error('Missing nonbubbling media event target');
			const setInputValue = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				'value',
			).set;
			const originalComposedPath = Event.prototype.composedPath;
			let currentInput = null;
			let currentMedia = null;
			let inputComposedPaths = 0;
			let mediaComposedPaths = 0;
			let nativeCaptures = 0;
			let nativeBubbles = 0;
			let nativeMediaCaptures = 0;
			let nativeMediaTargets = 0;
			let nativeMediaBubbles = 0;
			let unexpectedFrameworkCaptures = 0;
			let invalidMediaCurrentTargets = 0;
			const mediaOrder = [];
			const capture = () => nativeCaptures++;
			const bubble = () => nativeBubbles++;
			const mediaCapture = () => nativeMediaCaptures++;
			const mediaTarget = () => nativeMediaTargets++;
			const mediaBubble = () => nativeMediaBubbles++;
			document.addEventListener('input', capture, true);
			document.addEventListener('input', bubble);
			document.addEventListener('play', mediaCapture, true);
			media.addEventListener('play', mediaTarget);
			document.addEventListener('play', mediaBubble);
			globalThis.__octaneDelegatedInputCapture = () => unexpectedFrameworkCaptures++;
			globalThis.__eventWorkMedia = (phase, event) => {
				mediaOrder.push(phase);
				const expected = phase === 'target-bubble' ? media : form;
				if (event.target !== media || event.currentTarget !== expected) {
					invalidMediaCurrentTargets++;
				}
			};
			Event.prototype.composedPath = function () {
				if (currentInput !== null && this.target === currentInput) inputComposedPaths++;
				if (currentMedia !== null && this.type === 'play' && this.target === currentMedia)
					mediaComposedPaths++;
				return originalComposedPath.call(this);
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
				currentMedia = media;
				media.dispatchEvent(new Event('play', { bubbles: false }));
				currentMedia = null;
			} finally {
				currentInput = null;
				currentMedia = null;
				Event.prototype.composedPath = originalComposedPath;
				document.removeEventListener('input', capture, true);
				document.removeEventListener('input', bubble);
				document.removeEventListener('play', mediaCapture, true);
				media.removeEventListener('play', mediaTarget);
				document.removeEventListener('play', mediaBubble);
				delete globalThis.__octaneDelegatedInputCapture;
				delete globalThis.__eventWorkMedia;
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
				inputComposedPaths,
				mediaComposedPaths,
				nativeCaptures,
				nativeBubbles,
				nativeMediaCaptures,
				nativeMediaTargets,
				nativeMediaBubbles,
				unexpectedFrameworkCaptures,
				frameworkBubbles: globalThis.__runtimeStress.stats.form.validationRequests,
				updatedFields,
				updatedOutputs,
				mediaHandlers: mediaOrder.length,
				mediaOrderCorrect: Number(
					mediaOrder.join(',') === 'form-capture,target-bubble,form-bubble',
				),
				invalidMediaCurrentTargets,
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
if (observed.inputComposedPaths > EVENTS * 2) {
	failures.push(`inputComposedPaths: ${observed.inputComposedPaths} exceeds ${EVENTS * 2}`);
}
if (observed.definitions !== EVENTS * 2) {
	failures.push(`definitions: ${observed.definitions} is not ${EVENTS * 2}`);
}
for (const key of ['descriptors', 'getters', 'capturePaths']) {
	if (observed[key] > 1) failures.push(`${key}: ${observed[key]} exceeds 1`);
}
if (observed.portalCycles !== PORTAL_CYCLES)
	failures.push(`portalCycles: ${observed.portalCycles} is not ${PORTAL_CYCLES}`);
for (const key of ['portalCaptures', 'portalClicks', 'portalBubbles']) {
	if (observed[key] !== PORTAL_CYCLES * 3)
		failures.push(`${key}: ${observed[key]} is not ${PORTAL_CYCLES * 3}`);
}
for (const key of ['portalRefsMounted', 'portalRefsCleared']) {
	if (observed[key] !== PORTAL_CYCLES * 2)
		failures.push(`${key}: ${observed[key]} is not ${PORTAL_CYCLES * 2}`);
}
for (const key of [
	'portalDetachedClicks',
	'portalNodesAfterUnmount',
	'previousSiblingReads',
	'documentPositionComparisons',
]) {
	if (observed[key] !== 0)
		failures.push(`${key}: ${observed[key]} is not zero after portal cleanup`);
}
for (const key of [
	'nativeCaptures',
	'nativeBubbles',
	'frameworkBubbles',
	'updatedFields',
	'updatedOutputs',
]) {
	if (noCaptureObserved[key] !== EVENTS)
		failures.push(`no capture ${key}: ${noCaptureObserved[key]} is not ${EVENTS}`);
}
if (noCaptureObserved.eventHosts !== FIELDS) {
	failures.push(`no capture eventHosts: ${noCaptureObserved.eventHosts} is not ${FIELDS}`);
}
if (noCaptureObserved.unexpectedFrameworkCaptures !== 0) {
	failures.push(
		`no capture unexpectedFrameworkCaptures: ${noCaptureObserved.unexpectedFrameworkCaptures} is not zero`,
	);
}
if (noCaptureObserved.inputComposedPaths !== EVENTS) {
	failures.push(
		`no capture inputComposedPaths: ${noCaptureObserved.inputComposedPaths} is not ${EVENTS}`,
	);
}
for (const key of ['nativeMediaCaptures', 'nativeMediaTargets', 'mediaOrderCorrect']) {
	if (noCaptureObserved[key] !== 1)
		failures.push(`no capture ${key}: ${noCaptureObserved[key]} is not 1`);
}
if (noCaptureObserved.mediaHandlers !== 3) {
	failures.push(`no capture mediaHandlers: ${noCaptureObserved.mediaHandlers} is not 3`);
}
for (const key of ['nativeMediaBubbles', 'invalidMediaCurrentTargets']) {
	if (noCaptureObserved[key] !== 0)
		failures.push(`no capture ${key}: ${noCaptureObserved[key]} is not zero`);
}
if (noCaptureObserved.mediaComposedPaths !== 1) {
	failures.push(`no capture mediaComposedPaths: ${noCaptureObserved.mediaComposedPaths} is not 1`);
}

console.log('Production delegated-event work:');
console.table(observed);
console.log('Production delegated-event work without authored capture:');
console.table(noCaptureObserved);
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
					{
						name: 'octane-tsrx-no-capture-work',
						ops: Object.fromEntries(
							Object.entries(noCaptureObserved).map(([name, value]) => [name, stat(value)]),
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
	console.log('All deterministic delegated-event work and lifecycle gates passed.');
}
