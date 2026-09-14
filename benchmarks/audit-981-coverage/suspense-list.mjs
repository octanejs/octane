// A keyed client list with independently pending Suspense boundaries and two
// memo wrappers. Named production entries are counted by Chromium after build;
// the unobserved minified bundle must pass the identical lifecycle/DOM controls.
process.env.NODE_ENV = 'production';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, transformSync } from 'esbuild';
import { chromium } from 'playwright';

const repo = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.resolve(process.env.CLIENT_SOURCE_ROOT ?? repo);
const { compile } = await import(
	pathToFileURL(path.join(repo, 'packages/octane/src/compiler/compile.js'))
);
const rows = 64;
const metrics = [
	'createBlock',
	'renderBlockInner',
	'RowImpl',
	'AsyncCellImpl',
	'forBlock',
	'reconcileKeyed',
];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const count = (value) => ({ median: value, min: value });
const fixture = `import { memo, use, useState, useLayoutEffect } from 'octane';
function AsyncCellImpl(props) @{
  const label = use(props.row.promise);
  useLayoutEffect(() => props.life(props.row.id), []);
  <button data-ready={props.row.id} onClick={() => props.pick(label)}>{label as string}</button>
}
const AsyncCell = memo(AsyncCellImpl);
function RowImpl(props) @{
  <li data-id={props.row.id}>
    <input defaultValue={props.row.label} />
    @try { <AsyncCell row={props.row} life={props.life} pick={props.pick} /> }
    @pending { <span data-pending={props.row.id}>pending</span> }
  </li>
}
const Row = memo(RowImpl);
export function App(props) @{
  const [items, setItems] = useState(props.items);
  const [tick, setTick] = useState(0);
  props.bind(setItems, setTick);
  <section><h1>{tick as string}</h1><ul>
    @for (const row of items; key row.id) { <Row row={row} life={props.life} pick={props.pick} /> }
  </ul></section>
}`;
const entry =
	compile(fixture, 'audit-suspense-list.tsrx', { mode: 'client', dev: false, hmr: false }).code +
	`
import { createRoot, flushSync } from 'octane';
export { createRoot, flushSync };
`;
const built = await build({
	stdin: { contents: entry, resolveDir: repo, sourcefile: 'audit-suspense-list.js' },
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'browser',
	target: 'es2022',
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	nodePaths: [path.join(repo, 'node_modules'), path.join(repo, 'packages/octane/node_modules')],
	plugins: [
		{
			name: 'selected-client',
			setup(plugin) {
				plugin.onResolve({ filter: /^octane(?:\/internal\/client)?$/ }, ({ path: request }) => ({
					path: path.join(
						sourceRoot,
						'packages/octane/src',
						request === 'octane' ? 'index.ts' : 'internal/client.ts',
					),
				}));
			},
		},
	],
});
const observed = built.outputFiles[0].text;
const clean = transformSync(observed, { minify: true, target: 'es2022' }).code;
const server = http.createServer((request, response) => {
	if (request.url === '/assets/list.mjs') {
		response.setHeader('Content-Type', 'text/javascript');
		response.end(observed);
	} else if (request.url === '/assets/clean.mjs') {
		response.setHeader('Content-Type', 'text/javascript');
		response.end(clean);
	} else {
		response.setHeader('Content-Type', 'text/html');
		response.end('<!doctype html><main></main>');
	}
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;
const results = [];
try {
	browser = await chromium.launch({
		headless: true,
		args: ['--no-sandbox', '--js-flags=--jitless'],
	});
	for (const instrumented of [false, true]) {
		const context = await browser.newContext();
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		const cdp = await context.newCDPSession(page);
		try {
			await page.goto(url);
			await page.evaluate(
				async ({ instrumented, rows }) => {
					const api = await import(instrumented ? '/assets/list.mjs' : '/assets/clean.mjs');
					const items = Array.from({ length: rows }, (_, id) => {
						let resolve;
						const promise = new Promise((accept) => {
							resolve = accept;
						});
						return { id, label: 'row-' + id, promise, resolve };
					});
					const mounts = new Map(),
						cleanups = new Map();
					const state = {
						api,
						items,
						mounts,
						cleanups,
						root: api.createRoot(document.querySelector('main')),
						picked: null,
					};
					state.props = {
						items,
						bind(setItems, setTick) {
							state.setItems = setItems;
							state.setTick = setTick;
						},
						life(id) {
							mounts.set(id, (mounts.get(id) ?? 0) + 1);
							return () => cleanups.set(id, (cleanups.get(id) ?? 0) + 1);
						},
						pick(label) {
							state.picked = label;
						},
					};
					window.audit = state;
				},
				{ instrumented, rows },
			);
			if (instrumented) {
				await cdp.send('Profiler.enable');
				await cdp.send('Profiler.startPreciseCoverage', {
					callCount: true,
					detailed: true,
					allowTriggeredUpdates: false,
				});
			}
			const phases = [];
			for (const phase of ['mount', 'settle-odd', 'settle-even', 'equal', 'reverse', 'unmount']) {
				if (instrumented) await cdp.send('Profiler.takePreciseCoverage');
				await page.evaluate(async (phase) => {
					const s = window.audit;
					if (phase === 'mount') s.root.render(s.api.App, s.props);
					else if (phase.startsWith('settle'))
						for (const row of s.items) {
							if (row.id % 2 === (phase === 'settle-odd' ? 1 : 0)) row.resolve(row.label);
						}
					else if (phase === 'equal') s.api.flushSync(() => s.setTick((tick) => tick + 1));
					else if (phase === 'reverse') s.api.flushSync(() => s.setItems(s.items.toReversed()));
					else s.root.unmount();
					// No artificial delay: drain native promise reactions and framework work.
					await Promise.resolve();
					await Promise.resolve();
					s.api.flushSync(() => {});
				}, phase);
				const ready =
					phase === 'mount' || phase === 'unmount' ? 0 : phase === 'settle-odd' ? rows / 2 : rows;
				await page.waitForFunction(
					({ ready, rows, phase }) =>
						[...document.querySelectorAll('[data-ready]')].filter(
							(node) => getComputedStyle(node).display !== 'none',
						).length === ready &&
						document.querySelectorAll('[data-pending]').length ===
							(phase === 'unmount' ? 0 : rows - ready),
					{ ready, rows, phase },
				);
				const calls = Object.fromEntries(metrics.map((name) => [name, 0]));
				if (instrumented) {
					const coverage = await cdp.send('Profiler.takePreciseCoverage');
					for (const script of coverage.result)
						if (script.url === url + 'assets/list.mjs') {
							for (const fn of script.functions) {
								// esbuild may suffix a nested compiled body when its wrapper shares the name.
								const name = /^(?:RowImpl|AsyncCellImpl)\d*$/.test(fn.functionName)
									? fn.functionName.replace(/\d+$/, '')
									: fn.functionName;
								if (Object.hasOwn(calls, name)) calls[name] += fn.ranges[0]?.count ?? 0;
							}
						}
				}
				const semantic = await page.evaluate(
					({ phase, rows, ready }) => {
						const s = window.audit;
						const check = (ok, message) => {
							if (!ok) throw new Error(phase + ': ' + message);
						};
						const elements = [...document.querySelectorAll('li[data-id]')];
						if (phase === 'unmount') {
							check(document.querySelector('main').innerHTML === '', 'unmount clears the root');
							check(
								s.cleanups.size === rows && [...s.cleanups.values()].every((count) => count === 1),
								'each committed effect cleans up once',
							);
						} else {
							check(elements.length === rows, 'every keyed row remains present');
							check(
								document.querySelectorAll('[data-pending]').length === rows - ready,
								'independent boundaries expose expected pending rows',
							);
							if (phase === 'mount') {
								s.elements = new Map(
									elements.map((element) => [Number(element.dataset.id), element]),
								);
								s.input = elements[0].querySelector('input');
								s.input.value = 'typed draft';
								s.input.focus();
							} else {
								check(
									elements.every(
										(element) => s.elements.get(Number(element.dataset.id)) === element,
									),
									'surviving rows preserve DOM identity',
								);
								check(
									s.input.value === 'typed draft',
									'input draft survives settle/update/reorder',
								);
								if (phase !== 'reverse')
									check(
										document.activeElement === s.input,
										'independent settlement does not move focus',
									);
							}
							const ids = elements.map((element) => Number(element.dataset.id));
							check(
								ids.every((id, index) => id === (phase === 'reverse' ? rows - 1 - index : index)),
								'key order follows the list',
							);
							for (const button of document.querySelectorAll('[data-ready]')) {
								const id = Number(button.dataset.ready);
								check(
									button.textContent === 'row-' + id,
									'resolved value belongs to its keyed boundary',
								);
								if (phase === 'settle-odd')
									check(id % 2 === 1, 'unsettled even boundaries stay pending');
							}
							check(
								s.mounts.size === ready && [...s.mounts.values()].every((count) => count === 1),
								'resolved effects mount exactly once',
							);
							check(s.cleanups.size === 0, 'survivors do not clean up during updates');
							if (ready) {
								const button = document.querySelector('[data-ready]');
								button.click();
								s.api.flushSync(() => {});
								check(s.picked === button.textContent, 'native event reads the resolved value');
							}
						}
						return {
							html: document.querySelector('main').innerHTML,
							mounts: [...s.mounts.keys()].sort((a, b) => a - b),
							cleanups: [...s.cleanups.keys()].sort((a, b) => a - b),
							picked: s.picked,
						};
					},
					{ phase, rows, ready },
				);
				assert.deepEqual(errors, []);
				phases.push({ phase, calls, semantic });
			}
			if (instrumented) {
				assert.equal(phases[0].calls.RowImpl, rows, 'observe every authored row on mount');
				for (const name of metrics)
					assert(
						phases.some((phase) => phase.calls[name] > 0),
						`observe reached ${name} work in at least one phase`,
					);
			}
			results.push(phases);
		} finally {
			await context.close();
		}
	}
	assert.deepEqual(
		results[0].map((phase) => phase.semantic),
		results[1].map((phase) => phase.semantic),
		'clean and observed builds perform identical work',
	);
	const targets = results[1].flatMap(({ phase, calls, semantic }) => [
		{
			name: `suspense-list-${phase}`,
			ops: Object.fromEntries(Object.entries(calls).map(([name, value]) => [name, count(value)])),
			semanticSha256: hash(JSON.stringify(semantic)),
		},
		{
			name: `suspense-list-${phase}-rows`,
			ops: Object.fromEntries(metrics.map((name) => [name, count(rows)])),
		},
	]);
	const result = {
		suite: 'audit-981-coverage',
		iterations: 1,
		environment: {
			node: process.version,
			chromium: browser.version(),
			platform: process.platform,
			arch: process.arch,
		},
		rows,
		fixtureSha256: hash(fixture),
		cleanSha256: hash(clean),
		observedSha256: hash(observed),
		targets,
	};
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
	console.log(JSON.stringify(result, null, 2));
} finally {
	await browser?.close();
	await new Promise((resolve) => server.close(resolve));
}
