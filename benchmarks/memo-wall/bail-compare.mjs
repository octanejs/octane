// Deterministic memo-bail compare work. Every row receives a fresh props
// object with equal values, so each memo boundary compares and bails. Own-prop
// ownership lookups are only needed for values an inherited Object.prototype
// read could also produce (undefined, functions and objects); a row with four
// primitive props and one callback needs one lookup, not five.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { compile } from '../../packages/octane/src/compiler/compile.js';

const here = import.meta.dirname;
const root = path.resolve(here, '../..');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const exportsMap = JSON.parse(
	fs.readFileSync(path.join(root, 'packages/octane/package.json')),
).exports;
const SMALL = 128;
const LARGE = 256;
const source = `import { memo } from 'octane';
type Item = { id: number; label: string; value: number };
function Row(props: { id: number; label: string; value: number; wall: string; onSelect: () => void }) @{
	globalThis.__rowRenders++;
	<li data-id={props.id} onClick={props.onSelect}>{props.label + ':' + props.value + ':' + props.wall}</li>
}
const MemoRow = memo(Row);
export function Rows(props: { items: Item[]; onSelect: () => void }) @{
	<ul>
		@for (const it of props.items; key it.id) {
			<MemoRow id={it.id} label={it.label} value={it.value} wall="B" onSelect={props.onSelect} />
		}
	</ul>
}`;
const compiled = compile(source, 'memo-bail-rows.tsrx', { dev: false, hmr: false }).code;

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-memo-bail-'));
const dom = new Window();
const priorGlobals = new Map();
const nativeHasOwn = Object.prototype.hasOwnProperty;
let payload;
try {
	for (const name of [
		'window',
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'SVGElement',
		'Text',
		'Comment',
		'Event',
		'MouseEvent',
		'MutationObserver',
	]) {
		priorGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === 'window' ? dom : dom[name],
		});
	}
	const bundled = await build({
		absWorkingDir: root,
		stdin: {
			contents: `export { Rows } from './memo-bail-rows.tsrx'; export { createRoot, flushSync } from 'octane';`,
			resolveDir: here,
		},
		bundle: true,
		format: 'esm',
		platform: 'browser',
		write: false,
		minify: true,
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		plugins: [
			{
				name: 'compiled-fixture',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const target = exportsMap[request === 'octane' ? '.' : '.' + request.slice(6)];
						assert.equal(typeof target, 'string', 'public authored source export');
						return { path: path.resolve(root, 'packages/octane', target) };
					});
					plugin.onResolve({ filter: /memo-bail-rows\.tsrx$/ }, () => ({
						path: path.join(here, 'memo-bail-rows.tsrx'),
					}));
					plugin.onLoad({ filter: /memo-bail-rows\.tsrx$/ }, () => ({
						contents: compiled,
						loader: 'js',
						resolveDir: here,
					}));
				},
			},
		],
	});
	const code = bundled.outputFiles[0].text;
	const output = path.join(scratch, 'fixture.mjs');
	fs.writeFileSync(output, code);
	// The runtime captures hasOwnProperty when it loads, so the counter is
	// installed first and only counts inside the measured commits.
	let counting = false;
	let lookups = 0;
	Object.prototype.hasOwnProperty = function (key) {
		if (counting) lookups++;
		return nativeHasOwn.call(this, key);
	};
	const { Rows, createRoot, flushSync } = await import(pathToFileURL(output).href);
	const onSelect = () => {};
	const itemsOf = (count, changed = -1) =>
		Array.from({ length: count }, (_, id) => ({
			id,
			label: 'row ' + id,
			value: id === changed ? -1 : id,
		}));
	const measured = {};
	let semantic;
	for (const count of [SMALL, LARGE]) {
		const container = document.createElement('main');
		document.body.append(container);
		const view = createRoot(container);
		try {
			globalThis.__rowRenders = 0;
			flushSync(() => view.render(Rows, { items: itemsOf(count), onSelect }));
			assert.equal(globalThis.__rowRenders, count);
			const rows = [...container.querySelectorAll('li')];
			globalThis.__rowRenders = 0;
			lookups = 0;
			counting = true;
			try {
				flushSync(() => view.render(Rows, { items: itemsOf(count), onSelect }));
			} finally {
				counting = false;
			}
			measured[count] = lookups;
			assert.equal(globalThis.__rowRenders, 0, 'equal props bail every row');
			assert.deepEqual([...container.querySelectorAll('li')], rows, 'rows keep their hosts');
			flushSync(() => view.render(Rows, { items: itemsOf(count, 7), onSelect }));
			assert.equal(globalThis.__rowRenders, 1, 'one changed row renders');
			assert.equal(rows[7].textContent, 'row 7:-1:B');
			if (count === LARGE) semantic = hash(container.innerHTML);
		} finally {
			view.unmount();
			container.remove();
		}
	}
	const perRow = (measured[LARGE] - measured[SMALL]) / (LARGE - SMALL);
	const value = (median) => ({ median, min: median, samples: 1 });
	payload = {
		suite: 'memo-wall',
		targets: [
			{
				name: 'bail-compare',
				ops: { bail_own_lookups: value(perRow) },
				meta: { gate: 'passed', measured, semantic },
			},
			{
				// One ownership lookup per row, for its callback prop.
				name: 'bail-compare-work-budget',
				ops: { bail_own_lookups: value(1) },
				meta: { gate: 'passed' },
			},
		],
		meta: {
			node: process.version,
			fixtureSha256: hash(source),
			compiledSha256: hash(compiled),
			bundleSha256: hash(code),
			limits:
				'Counts Object.prototype.hasOwnProperty calls per bailed row in happy-dom, as the difference between two list sizes; not timing.',
		},
	};
	console.log(JSON.stringify(payload, null, 2));
} catch (error) {
	payload = { suite: 'memo-wall', failed: error.stack ?? String(error) };
	throw error;
} finally {
	Object.prototype.hasOwnProperty = nativeHasOwn;
	if (payload && process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
	for (const [name, descriptor] of priorGlobals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else delete globalThis[name];
	}
	dom.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
