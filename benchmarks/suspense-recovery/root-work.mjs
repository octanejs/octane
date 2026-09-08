// Production no-boundary suspension work, using the existing browser regression
// fixture. The entry adapter does not add probes to component render bodies.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectPreciseCalls } from '../lib/precise-work.mjs';
import {
	chromium,
	closeResources,
	countStat,
	environmentFor,
	hashOctaneSources,
	packageVersion,
} from '../activity/harness.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = path.resolve(here, '../..');
const scratch = path.join(here, 'dist/root-work');
const fixture = path.join(repo, 'packages/octane/tests/browser/suspense-hydration');
const requireNews = createRequire(path.join(repo, 'benchmarks/news/package.json'));
const requireOctane = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build, preview } = await import(pathToFileURL(requireNews.resolve('vite')));
const { octane } = await import(pathToFileURL(requireOctane.resolve('octane/compiler/vite')));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const sourceHash = hashOctaneSources(path.join(repo, 'packages/octane'));
const directInputs = Object.fromEntries(
	['index.html', 'main.ts', 'root-suspension.tsrx'].map((name) => [
		name,
		hash(fs.readFileSync(path.join(fixture, name))),
	]),
);
const shapes = ['component', 'branch', 'root', 'keyed', 'empty'];
const operations = ['hold', 'retry'];
const metrics = [
	'StructuralRoot',
	'StructuralRootReplacement',
	'StructuralReplacement',
	'StructuralInput',
	'StructuralReader',
	'renderBlock',
	'createBlock',
	'beginRootRender',
	'suspendRootRender',
	'rollbackRootRender',
	'commitRootRenders',
	'renderOffscreen',
	'spliceOffscreenCapture',
	'discardOffscreenCapture',
	'journalRootSlot',
	'journalForSlot',
	'parkItemForHold',
	'restoreForSlot',
	'deferRootReplacement',
	'unmountBlockInner',
];

function installControls() {
	const bridge = window.__suspenseHydration;
	const shape = new URLSearchParams(location.search).get('shape');
	const container = document.querySelector('#suspense-root');
	const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
	const check = (actual, expected, label) => {
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			throw new Error(
				`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
			);
		}
	};
	let input;
	let keep;
	let reader;
	let rootHost;
	let initialHtml;
	const markup = () => container.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
	const snapshot = () => ({
		...bridge.snapshot(),
		readerSame: container.querySelector('#root-suspension-value') === reader,
		rootSame: container.firstElementChild === rootHost,
	});
	window.__rootPrepare = () => {
		input = container.querySelector('#root-suspension-input');
		keep = container.querySelector('[data-root-key="keep"]');
		reader = container.querySelector('#root-suspension-value');
		rootHost = container.firstElementChild;
		input.value = 'browser-owned draft';
		bridge.prepareInput();
		initialHtml = markup();
		window.__rootVerifyHold();
	};
	window.__rootHold = async () => {
		bridge.urgent();
		await frame();
	};
	window.__rootRetry = async () => {
		bridge.resolve();
		const deadline = performance.now() + 10000;
		while (bridge.snapshot().value !== 'B') {
			if (performance.now() > deadline) throw new Error('Root retry did not commit B');
			await frame();
		}
	};
	window.__rootVerifyHold = () => {
		const state = snapshot();
		const expected = {
			inputSame: true,
			inputConnected: true,
			activeId: 'root-suspension-input',
			inputValue: 'browser-owned draft',
			selectionStart: 2,
			selectionEnd: 9,
			keepSame: true,
			emptyCount: 0,
			value: 'A',
			replacementCount: 0,
			nativeEvents: [],
			lifecycle: ['input:mount'],
			globalFailures: [],
			readerSame: true,
			rootSame: true,
		};
		for (const [key, value] of Object.entries(expected))
			check(state[key], value, `${shape}/hold/${key}`);
		check(markup(), initialHtml, `${shape}/held DOM`);
		return { ...expected, markup: markup() };
	};
	window.__rootVerifyRetry = () => {
		const state = snapshot();
		const expected = {
			inputSame: false,
			inputConnected: false,
			keepSame: shape !== 'empty',
			emptyCount: shape === 'empty' ? 1 : 0,
			value: 'B',
			replacementCount: shape === 'keyed' || shape === 'empty' ? 0 : 1,
			lifecycle: ['input:mount', 'input:cleanup'],
			globalFailures: [],
			readerSame: shape !== 'root',
			rootSame: shape !== 'root',
		};
		for (const [key, value] of Object.entries(expected))
			check(state[key], value, `${shape}/retry/${key}`);
		return { ...expected, markup: markup() };
	};
	window.__rootCleanup = () => {
		bridge.unmount();
		const state = bridge.snapshot();
		check(container.childNodes.length, 0, `${shape}/unmount DOM`);
		check(state.lifecycle, ['input:mount', 'input:cleanup'], `${shape}/unmount lifetime`);
		check(state.globalFailures, [], `${shape}/unmount errors`);
	};
	window.__rootObserve = async (operation) => {
		const counts = {
			childListRecords: 0,
			addedNodes: 0,
			removedNodes: 0,
			attributeWrites: 0,
			characterDataWrites: 0,
			removedInputRanges: 0,
			removedKeepRanges: 0,
		};
		const record = (records) => {
			for (const mutation of records) {
				if (mutation.type === 'attributes') counts.attributeWrites++;
				else if (mutation.type === 'characterData') counts.characterDataWrites++;
				else {
					counts.childListRecords++;
					counts.addedNodes += mutation.addedNodes.length;
					counts.removedNodes += mutation.removedNodes.length;
					for (const node of mutation.removedNodes) {
						if (node === input || node.contains(input)) counts.removedInputRanges++;
						if (keep !== null && (node === keep || node.contains(keep))) counts.removedKeepRanges++;
					}
				}
			}
		};
		const observer = new MutationObserver(record);
		observer.observe(container, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: true,
		});
		try {
			await (operation === 'hold' ? window.__rootHold() : window.__rootRetry());
			record(observer.takeRecords());
		} finally {
			observer.disconnect();
		}
		const semantic = operation === 'hold' ? window.__rootVerifyHold() : window.__rootVerifyRetry();
		if (operation === 'hold') {
			check(counts.removedInputRanges, 0, `${shape}/held input removals`);
			check(counts.removedKeepRanges, 0, `${shape}/held survivor removals`);
		}
		return { counts, semantic };
	};
	window.__ready = bridge.kind === 'root-suspension';
}

const adapterSource = `\n(${installControls.toString()})();\n`;
const outDir = path.join(scratch, 'build');
const targets = [];
const checksums = new Map();
let server;
let browser;
let failed;
let environment;
let assets;

try {
	process.env.NODE_ENV = 'production';
	const result = await build({
		configFile: false,
		root: fixture,
		mode: 'production',
		logLevel: 'warn',
		plugins: [
			{
				name: 'root-suspension-work-controls',
				enforce: 'pre',
				resolveId(request) {
					if (request === 'octane' || request.startsWith('octane/'))
						return requireOctane.resolve(request);
					if (
						request === 'react' ||
						request.startsWith('react/') ||
						request === 'react-dom' ||
						request.startsWith('react-dom/')
					)
						return requireOctane.resolve(request);
					return null;
				},
				// Keep main.ts as the real HTML entry (the package is sideEffects:false).
				// Only its public bridge gains flat hooks for the shared work harness.
				transform(code, id) {
					return id === path.join(fixture, 'main.ts') ? `${code}${adapterSource}` : null;
				},
			},
			octane({ hmr: false, profile: false }),
		],
		define: {
			'process.env.NODE_ENV': JSON.stringify('production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		build: { outDir, emptyOutDir: true, minify: false, target: 'esnext' },
	});
	assert.equal(
		hashOctaneSources(path.join(repo, 'packages/octane')),
		sourceHash,
		'Source changed during production build',
	);
	for (const [name, digest] of Object.entries(directInputs))
		assert.equal(
			hash(fs.readFileSync(path.join(fixture, name))),
			digest,
			`Fixture changed: ${name}`,
		);
	const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output);
	const executable = outputs
		.filter((entry) => entry.type === 'chunk')
		.map((entry) => entry.code)
		.join('\n');
	assert.ok(
		/\bfunction StructuralRoot\s*\(/.test(executable),
		'Existing compiled fixture entry was omitted',
	);
	assert.ok(
		/\bfunction suspendRootRender\s*\(/.test(executable),
		'Root suspension runtime was omitted',
	);
	assets = Object.fromEntries(
		outputs
			.filter((entry) => entry.type === 'chunk')
			.map((entry) => [entry.fileName, hash(entry.code)]),
	);
	fs.mkdirSync(scratch, { recursive: true });
	fs.writeFileSync(
		path.join(scratch, 'build-inputs.json'),
		JSON.stringify({ sourceHash, directInputs, adapterHash: hash(adapterSource), assets }, null, 2),
	);
	console.log(`BUILD_READY ${sourceHash}`);
	server = await preview({
		configFile: false,
		root: fixture,
		logLevel: 'error',
		build: { outDir },
		preview: { host: '127.0.0.1', port: 0, strictPort: true },
	});
	const address = server.httpServer.address();
	assert.ok(address && typeof address !== 'string');
	browser = await chromium().launch({
		headless: true,
		args: ['--no-sandbox', '--js-flags=--jitless'],
	});
	environment = environmentFor(browser, { jitless: true });
	for (const shape of shapes) {
		for (const operation of operations) {
			const before = [
				'__rootPrepare',
				...(operation === 'retry' ? ['__rootHold', '__rootVerifyHold'] : []),
			];
			const urlFor = (implementation) =>
				`http://127.0.0.1:${address.port}/?case=root-suspension&shape=${shape}&implementation=${implementation}`;
			const calls = await collectPreciseCalls(browser, {
				url: urlFor('octane'),
				before,
				operation: operation === 'hold' ? '__rootHold' : '__rootRetry',
				after: [operation === 'hold' ? '__rootVerifyHold' : '__rootVerifyRetry', '__rootCleanup'],
				metrics,
			});
			// The replacement subtree is genuine work, not a speculative preflight
			// followed by a second render of the same successful replacement.
			assert.equal(
				calls.StructuralReplacement,
				shape === 'keyed' || shape === 'empty' ? 0 : 1,
				`${shape}/${operation} replacement body count`,
			);
			assert.equal(calls.StructuralReader, 1, `${shape}/${operation} reader body count`);
			assert.equal(calls.StructuralInput, 0, `${shape}/${operation} retired input body count`);
			assert.equal(
				calls.suspendRootRender,
				operation === 'hold' ? 1 : 0,
				`${shape}/${operation} suspension count`,
			);
			for (const implementation of ['octane', 'react']) {
				const context = await browser.newContext();
				const page = await context.newPage();
				const errors = [];
				page.on('pageerror', (error) => errors.push(error.message));
				page.on('console', (message) => {
					if (message.type() === 'error') errors.push(message.text());
				});
				try {
					await page.goto(urlFor(implementation), { waitUntil: 'load' });
					await page.waitForFunction(() => window.__ready === true);
					for (const hook of before) await page.evaluate((name) => window[name](), hook);
					const observed = await page.evaluate((op) => window.__rootObserve(op), operation);
					await page.evaluate(() => window.__rootCleanup());
					assert.deepEqual(errors, [], `${implementation}/${shape}/${operation} browser errors`);
					const checksumKey = `${shape}/${operation}`;
					if (implementation === 'octane') checksums.set(checksumKey, observed.semantic);
					else
						assert.deepEqual(
							observed.semantic,
							checksums.get(checksumKey),
							`${checksumKey} React semantic control`,
						);
					const measurements = {
						...(implementation === 'octane' ? calls : {}),
						...observed.counts,
					};
					targets.push({
						name: `${implementation}-${shape}-${operation}`,
						ops: Object.fromEntries(
							Object.entries(measurements).map(([key, value]) => [key, countStat(value)]),
						),
						meta: { correctness: 'pass', semanticChecksum: observed.semantic },
					});
					console.log(
						`PASS ${implementation}/${shape}/${operation} ${JSON.stringify(measurements)}`,
					);
				} finally {
					await context.close();
				}
			}
		}
	}
} catch (error) {
	failed = error instanceof Error ? error.stack : String(error);
} finally {
	const cleanupErrors = await closeResources(browser, server);
	if (cleanupErrors.length) failed = [failed, ...cleanupErrors].filter(Boolean).join('\n');
}

const payload = {
	suite: 'root-suspension-work',
	targets,
	meta: {
		sourceHash,
		directInputs,
		adapterHash: hash(adapterSource),
		assets,
		environment,
		node: process.version,
		vite: requireNews('vite/package.json').version,
		playwright: requireNews('playwright/package.json').version,
		esbuild: packageVersion(requireOctane, 'esbuild'),
		tsrxCore: packageVersion(requireOctane, '@tsrx/core'),
		react: requireOctane('react/package.json').version,
		parser: 'package-default',
		lockfileHash: hash(fs.readFileSync(path.join(repo, 'pnpm-lock.yaml'))),
		production: true,
		minified: false,
		iterations: 1,
		measurement:
			'Separate jitless precise-call coverage and MutationObserver passes; setup and semantic verification outside call coverage.',
		limitations: [
			'No timing or speed claim: baseline no-boundary suspension was semantically broken.',
			'React is the existing public-API semantic twin, not a call-count baseline or React Compiler benchmark.',
			'Five bounded fixture shapes, not a scaling/allocation benchmark. Named call counts cannot measure arbitrary allocation volume.',
			'DOM counters observe the connected fixture container, not detached staging. Equivalent final DOM does not require identical physical mutation counts.',
		],
	},
	...(failed ? { failed } : {}),
};
const output = process.env.BENCH_JSON ?? path.join(scratch, 'result.json');
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
if (failed) {
	console.error(failed);
	process.exitCode = 1;
}
