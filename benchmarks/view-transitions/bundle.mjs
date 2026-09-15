import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { verifyScenario } from '../bundle-size/verify-reachability.mjs';
import {
	countStat,
	hashOctaneSources,
	octanePackageAt,
	parseOptions,
	packageVersion,
	writePayload,
} from '../activity/harness.mjs';
import { launchBrowser } from '../../test-utils/playwright-browser.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = path.resolve(HERE, '../..');
const options = parseOptions(process.argv.slice(2));
const source = octanePackageAt(options.revision);
const sourceHash = hashOctaneSources(source.packageRoot);
function fixtureHash() {
	const hash = createHash('sha256');
	for (const relative of [
		'packages/octane/tests/browser/view-transition-parity/App.tsrx',
		'packages/octane/tests/browser/view-transition-parity/main.ts',
		'packages/octane/tests/browser/view-transition-parity/index.html',
		'benchmarks/bundle-size/fixtures/minimal/root-static.tsrx',
		'benchmarks/bundle-size/fixtures/minimal/hooks-state.tsrx',
	])
		hash
			.update(relative)
			.update('\0')
			.update(fs.readFileSync(path.join(REPO, relative)))
			.update('\0');
	return hash.digest('hex');
}
const fixtures = fixtureHash();
const packageRequire = createRequire(path.join(source.packageRoot, 'package.json'));
const repoRequire = createRequire(path.join(REPO, 'package.json'));
const { build } = await import(pathToFileURL(repoRequire.resolve('vite')).href);
const { octane } = await import(pathToFileURL(packageRequire.resolve('octane/compiler/vite')).href);
process.env.NODE_ENV = 'production';
const targets = [];
const ordinaryFixtures = [];
const plugins = () => [
	{
		name: 'view-transition-audit-source',
		enforce: 'pre',
		resolveId(id) {
			if (id === 'octane' || id.startsWith('octane/')) return packageRequire.resolve(id);
			return null;
		},
	},
	octane({ hmr: false, profile: false }),
];
const define = {
	__OCTANE_PROFILE_ENABLED__: 'false',
	'process.env.NODE_ENV': JSON.stringify('production'),
};
const baselineMeta = {
	revision: source.revision,
	sourceSha256: sourceHash,
	fixtureSourceSha256: fixtures,
	node: process.version,
	platform: process.platform,
	arch: process.arch,
	lockfileSha256: createHash('sha256')
		.update(fs.readFileSync(path.join(REPO, 'pnpm-lock.yaml')))
		.digest('hex'),
	toolchain: {
		vite: packageVersion(repoRequire, 'vite'),
		esbuild: packageVersion(packageRequire, 'esbuild'),
		tsrxCore: packageVersion(packageRequire, '@tsrx/core'),
		playwright: packageVersion(repoRequire, 'playwright'),
	},
};
function byteMetrics(code) {
	return { raw: Buffer.byteLength(code), gzip: gzipSync(code, { level: 9 }).length };
}
function target(name, measured, meta) {
	targets.push({
		name,
		ops: Object.fromEntries(
			Object.entries(measured).map(([key, value]) => [key, countStat(value)]),
		),
		meta: { ...baselineMeta, ...meta },
	});
	console.log(`PASS ${name}: ${JSON.stringify(measured)}`);
}
let failure;
try {
	for (const scenario of ['root-static', 'hooks-state']) {
		const result = await build({
			configFile: false,
			root: HERE,
			mode: 'production',
			logLevel: 'error',
			plugins: plugins(),
			define,
			build: {
				write: false,
				minify: false,
				target: 'esnext',
				lib: {
					entry: path.resolve(HERE, `../bundle-size/fixtures/minimal/${scenario}.tsrx`),
					formats: ['iife'],
					name: '__OCTANE_REACHABILITY__',
				},
			},
		});
		const code = (Array.isArray(result) ? result[0] : result).output.find(
			(file) => file.type === 'chunk',
		).code;
		const { transformSync } = packageRequire('esbuild');
		const minified = transformSync(code, { minify: true, target: 'esnext' }).code;
		const snapshot = await verifyScenario(scenario, minified);
		// Reachability is a benchmark diagnostic; executable output is the semantic control.
		const reachable = Number(/\bfunction vtFlush\s*\(/.test(code));
		const stagingReachable = Number(/\bDOMStage\b/.test(code));
		assert.equal(reachable, 0, 'Ordinary apps must not retain the optional View Transition driver');
		assert.equal(
			stagingReachable,
			0,
			'Ordinary apps must not retain the optional DOM staging adapter',
		);
		target(
			`vt-bundle-${scenario}`,
			{
				...byteMetrics(minified),
				driver_reachable: reachable,
				staging_reachable: stagingReachable,
			},
			{
				snapshot,
				bundleSha256: createHash('sha256').update(minified).digest('hex'),
			},
		);
		ordinaryFixtures.push({ scenario, code: minified, snapshot });
	}
	const fixture = path.resolve(REPO, 'packages/octane/tests/browser/view-transition-parity');
	const buildResult = await build({
		configFile: false,
		root: fixture,
		mode: 'production',
		logLevel: 'error',
		plugins: plugins(),
		define,
		build: { write: false, minify: false, target: 'esnext' },
	});
	const assets = new Map(
		buildResult.output.map((asset) => [
			'/' + asset.fileName,
			asset.type === 'chunk' ? asset.code : asset.source,
		]),
	);
	const chunks = buildResult.output.filter((file) => file.type === 'chunk');
	assert.equal(chunks.length, 1, 'The positive fixture must have one complete executable asset');
	assert.deepEqual(chunks[0].imports, []);
	assert.deepEqual(chunks[0].dynamicImports, []);
	const code = chunks.map((file) => file.code).join('\n');
	const { transformSync } = packageRequire('esbuild');
	const minified = transformSync(code, { minify: true, target: 'esnext' }).code;
	assert.match(
		code,
		/\bfunction vtFlush\s*\(/,
		'The positive fixture must retain its transition driver',
	);
	const server = createServer((request, response) => {
		const pathname = new URL(request.url, 'http://localhost').pathname;
		const asset = assets.get(pathname === '/' ? '/index.html' : pathname);
		if (asset === undefined) {
			response.writeHead(404).end();
			return;
		}
		response.setHeader(
			'Content-Type',
			pathname.endsWith('.js')
				? 'text/javascript'
				: pathname.endsWith('.css')
					? 'text/css'
					: 'text/html',
		);
		response.end(asset);
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	let browser;
	const outcomes = [];
	try {
		browser = await launchBrowser({ headless: true });
		for (const fixture of ordinaryFixtures) {
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			try {
				await page.setContent('<!doctype html><div id="root"></div>');
				await page.addScriptTag({ content: fixture.code });
				const result = await page.evaluate(async () => {
					const counts = { rect_reads: 0, computed_style_reads: 0, native_transitions: 0 };
					const rect = Element.prototype.getBoundingClientRect;
					const style = window.getComputedStyle;
					const start = document.startViewTransition;
					Element.prototype.getBoundingClientRect = function (...args) {
						counts.rect_reads++;
						return Reflect.apply(rect, this, args);
					};
					window.getComputedStyle = function (...args) {
						counts.computed_style_reads++;
						return Reflect.apply(style, this, args);
					};
					document.startViewTransition = function (...args) {
						counts.native_transitions++;
						return Reflect.apply(start, this, args);
					};
					try {
						return {
							counts,
							snapshot: await window.__OCTANE_REACHABILITY__.run(document.querySelector('#root')),
						};
					} finally {
						Element.prototype.getBoundingClientRect = rect;
						window.getComputedStyle = style;
						document.startViewTransition = start;
					}
				});
				assert.deepEqual(result.snapshot, fixture.snapshot);
				assert.deepEqual(result.counts, {
					rect_reads: 0,
					computed_style_reads: 0,
					native_transitions: 0,
				});
				assert.deepEqual(errors, []);
				target(`vt-work-${fixture.scenario}`, result.counts, {
					browser: browser.version(),
					snapshot: result.snapshot,
				});
			} finally {
				await page.close();
			}
		}
		for (const observed of [false, true]) {
			assets.set('/' + chunks[0].fileName, observed ? code : minified);
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			try {
				await page.goto(`http://127.0.0.1:${server.address().port}/`);
				await page.waitForFunction(() => Boolean(window.__viewTransitionParity));
				const result = await page.evaluate(async (observe) => {
					const counts = { rect_reads: 0, computed_style_reads: 0, native_transitions: 0 };
					const rect = Element.prototype.getBoundingClientRect;
					const style = window.getComputedStyle;
					const start = document.startViewTransition;
					if (observe) {
						Element.prototype.getBoundingClientRect = function (...args) {
							counts.rect_reads++;
							return Reflect.apply(rect, this, args);
						};
						window.getComputedStyle = function (...args) {
							counts.computed_style_reads++;
							return Reflect.apply(style, this, args);
						};
						document.startViewTransition = function (...args) {
							counts.native_transitions++;
							return Reflect.apply(start, this, args);
						};
					}
					const input = document.querySelector('#draft');
					input.value = 'retained draft';
					const output = [];
					try {
						for (let generation = 1; generation <= 4; generation++) {
							const mark = window.__viewTransitionParity.render({
								text: `generation ${generation}`,
							});
							while (document.querySelector('#generation').textContent !== String(mark.generation))
								await new Promise(requestAnimationFrame);
							const snapshot = await window.__viewTransitionParity.settle(mark);
							output.push({
								text: snapshot.text,
								inputIdentity: snapshot.inputIdentity,
								inputValue: snapshot.inputValue,
								kinds: snapshot.events.map((event) => event.kind),
								animated: snapshot.events.every((event) => event.hasAnimation),
							});
						}
					} finally {
						Element.prototype.getBoundingClientRect = rect;
						window.getComputedStyle = style;
						document.startViewTransition = start;
					}
					return { counts, output };
				}, observed);
				assert.deepEqual(
					result.output,
					Array.from({ length: 4 }, (_, index) => ({
						text: `generation ${index + 1}`,
						inputIdentity: true,
						inputValue: 'retained draft',
						kinds: ['update'],
						animated: true,
					})),
				);
				assert.deepEqual(errors, []);
				outcomes.push(result);
			} finally {
				await page.close();
			}
		}
		assert.deepEqual(
			outcomes[0].output,
			outcomes[1].output,
			'Instrumentation must preserve the executed workload',
		);
		target(
			'vt-bundle-active',
			{
				...byteMetrics(minified),
				driver_reachable: 1,
				staging_reachable: Number(/\bDOMStage\b/.test(code)),
			},
			{
				browser: browser.version(),
				snapshot: outcomes[0].output,
				bundleSha256: createHash('sha256').update(minified).digest('hex'),
			},
		);
		target('vt-work-four-updates', outcomes[1].counts, {
			browser: browser.version(),
			snapshot: outcomes[1].output,
		});
		target(
			'vt-work-model',
			{
				updates: 4,
				rect_reads: 4,
				computed_style_reads: 4,
				native_transitions: 4,
				driver_reachable: 1,
				staging_reachable: 1,
			},
			{ semanticControl: 'four completed native animations preserve the input and final text' },
		);
	} finally {
		await browser?.close();
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
	assert.equal(
		hashOctaneSources(source.packageRoot),
		sourceHash,
		'Source changed during measurements',
	);
	assert.equal(fixtureHash(), fixtures, 'Fixture changed during measurements');
} catch (error) {
	failure = error.stack ?? String(error);
}
writePayload({ suite: 'view-transitions', targets, ...(failure ? { failed: failure } : {}) });
if (failure) {
	console.error(failure);
	process.exitCode = 1;
}
