// Isolated production-runtime dispatch work. Intrinsic observers are installed
// only for the untimed sample; public native-event outcomes are checked in both.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const timingEvents = Number(process.env.EVENT_TIMING_EVENTS ?? 2000);
const timingRounds = Number(process.env.EVENT_TIMING_ROUNDS ?? 12);
assert(Number.isSafeInteger(timingEvents) && timingEvents > 0);
assert(Number.isSafeInteger(timingRounds) && timingRounds > 0);
const runtimePath = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : null;
const runtime = runtimePath
	? await readFile(runtimePath, 'utf8')
	: (
			await build({
				entryPoints: [
					fileURLToPath(new URL('../../packages/octane/src/runtime.ts', import.meta.url)),
				],
				bundle: true,
				write: false,
				platform: 'browser',
				format: 'esm',
				define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			})
		).outputFiles[0].text;
const server = createServer((request, response) => {
	if (request.url === '/runtime.mjs') {
		response.writeHead(200, { 'Content-Type': 'text/javascript' });
		response.end(runtime);
	} else {
		response.writeHead(200, { 'Content-Type': 'text/html' });
		response.end(
			'<!doctype html><script type="module">import * as runtime from "/runtime.mjs";window.runtime=runtime;</script>',
		);
	}
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
	browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
	const page = await browser.newPage();
	const failures = [];
	page.on('pageerror', (error) => failures.push(error.message));
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	await page.waitForFunction(() => window.runtime !== undefined);
	const report = await page.evaluate(
		({ timingEvents, timingRounds }) => {
			const { createRoot, createElement, flushSync } = window.runtime;
			const container = document.createElement('div');
			document.body.append(container);
			const root = createRoot(container);
			const depth = 8;
			let active,
				callbacks = 0,
				nativeAfter = 0,
				invalid = 0,
				symbolPeak = 0;
			const handler = (event) => {
				callbacks++;
				if (
					event !== active ||
					!(event instanceof MouseEvent) ||
					event.target.id !== 'event-target' ||
					!event.currentTarget.id.startsWith('event-')
				)
					invalid++;
				if (observing)
					symbolPeak = Math.max(
						symbolPeak,
						Object.getOwnPropertySymbols(event).filter((key) =>
							[
								'octane.propagationFlags',
								'octane.stopPropagation',
								'octane.stopImmediatePropagation',
								'octane.currentTarget',
							].includes(key.description),
						).length,
					);
			};
			let body = createElement('button', { id: 'event-target', onClick: handler }, 'dispatch');
			for (let index = 0; index < depth; index++)
				body = createElement(
					'div',
					{
						id: `event-${index}`,
						onClick: handler,
						...(index === depth - 1 ? { onClickCapture: handler } : null),
					},
					body,
				);
			flushSync(() => root.render(body));
			const target = container.querySelector('#event-target');
			const stop = Event.prototype.stopPropagation;
			container.addEventListener('click', (event) => {
				nativeAfter++;
				if (
					event !== active ||
					event.currentTarget !== container ||
					Object.hasOwn(event, 'currentTarget') ||
					event.stopPropagation !== stop ||
					Object.hasOwn(event, 'stopPropagation')
				)
					invalid++;
			});
			let observing = false,
				setProbes = 0,
				typeLookups = 0,
				portalReads = 0;
			const oldSetHas = Set.prototype.has,
				oldMapGet = Map.prototype.get;
			const portalDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, '$$portalParent');
			function dispatch(count) {
				for (let index = 0; index < count; index++) {
					active = new MouseEvent('click', { bubbles: true, cancelable: true });
					target.dispatchEvent(active);
					if (
						active.currentTarget !== null ||
						Object.hasOwn(active, 'currentTarget') ||
						Object.hasOwn(active, 'stopPropagation')
					)
						invalid++;
				}
			}
			dispatch(500);
			callbacks = 0;
			nativeAfter = 0;
			observing = true;
			Set.prototype.has = function (value) {
				if (value === 'click') setProbes++;
				return oldSetHas.call(this, value);
			};
			Map.prototype.get = function (value) {
				if (value === 'click') typeLookups++;
				return oldMapGet.call(this, value);
			};
			Object.defineProperty(Element.prototype, '$$portalParent', {
				configurable: true,
				get() {
					portalReads++;
					return undefined;
				},
				set(value) {
					Object.defineProperty(this, '$$portalParent', {
						value,
						writable: true,
						configurable: true,
					});
				},
			});
			try {
				dispatch(128);
			} finally {
				Set.prototype.has = oldSetHas;
				Map.prototype.get = oldMapGet;
				if (portalDescriptor === undefined) delete Element.prototype.$$portalParent;
				else Object.defineProperty(Element.prototype, '$$portalParent', portalDescriptor);
				observing = false;
			}
			const work = {
				events: 128,
				callbacks,
				nativeAfter,
				invalid,
				setProbes,
				typeLookups,
				portalReads,
				symbolPeak,
			};
			const timings = [];
			for (let round = 0; round < timingRounds; round++) {
				const start = performance.now();
				dispatch(timingEvents);
				timings.push(((performance.now() - start) * 1000) / timingEvents);
			}
			if (invalid !== 0) throw new Error(`Native event semantics failed ${invalid} times`);
			root.unmount();
			container.remove();
			return { work, timingEvents, timingRounds, microsecondsPerDispatch: timings };
		},
		{ timingEvents, timingRounds },
	);
	assert.equal(report.work.invalid, 0);
	assert.equal(report.work.callbacks, 128 * 10);
	assert.equal(report.work.nativeAfter, 128);
	assert.deepEqual(failures, []);
	if (!args.includes('--observe')) {
		assert.equal(report.work.setProbes, 0, 'Registered click metadata should avoid Set probes');
		assert.equal(report.work.portalReads, 0, 'Portal-free clicks should avoid portal-parent reads');
		assert.equal(report.work.symbolPeak, 0, 'Temporary dispatch state should stay off the Event');
		assert(report.work.typeLookups <= 256, 'Each click needs at most two registered-type reads');
	}
	if (process.env.BENCH_JSON) {
		const stat = (value) => ({ median: value, min: value, samples: 1 });
		const keys = ['setProbes', 'portalReads', 'symbolPeak', 'typeLookups'];
		await writeFile(
			process.env.BENCH_JSON,
			JSON.stringify(
				{
					suite: 'event-delegation-dispatch-work',
					targets: [
						{
							name: 'dispatch-work',
							ops: Object.fromEntries(keys.map((key) => [key, stat(report.work[key])])),
							meta: { gate: 'passed' },
						},
						{
							name: 'dispatch-work-model',
							ops: Object.fromEntries(
								keys.map((key) => [key, stat(key === 'typeLookups' ? 256 : 1)]),
							),
						},
					],
				},
				null,
				2,
			) + '\n',
		);
	}
	const json =
		JSON.stringify({ runtime: runtimePath, browser: browser.version(), ...report }, null, 2) + '\n';
	const output = args.indexOf('--output');
	if (output !== -1) await writeFile(resolve(args[output + 1]), json);
	process.stdout.write(json);
} finally {
	await browser?.close();
	await new Promise((resolve) => server.close(resolve));
}
