// Deterministic event-authority work for keyed rows in a module that only
// carries potential signal bindings. Each row publishes a native click handler,
// and that handler's signal authority must be recorded without weak-map
// insertions: they were the per-row mount cost after async signals landed.
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
const INSERTED = 64;
const source = `import { useState } from 'octane';
export function Rows(props: { rows: { id: number; label: string }[] }) @{
	const [picked, setPicked] = useState(-1);
	<ul>
		@for (const row of props.rows; key row.id) {
			<li class={picked === row.id ? 'picked' : ''}>
				<button data-id={row.id} onClick={() => setPicked(row.id)}>{row.label as string}</button>
			</li>
		}
	</ul>
}`;
const compiled = compile(source, 'event-owner-rows.tsrx', { dev: false, hmr: false }).code;
// The guarded path only exists in modules that may receive a signal handle.
assert.match(compiled, /enableSignalBindings\(1, true\)/, 'potential signal bindings');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-event-owners-'));
const dom = new Window();
const priorGlobals = new Map();
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
			contents: `export { Rows } from './event-owner-rows.tsrx'; export { createRoot, flushSync } from 'octane';`,
			resolveDir: here,
		},
		bundle: true,
		format: 'esm',
		platform: 'browser',
		write: false,
		minify: true,
		metafile: true,
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
					plugin.onResolve({ filter: /event-owner-rows\.tsrx$/ }, () => ({
						path: path.join(here, 'event-owner-rows.tsrx'),
					}));
					plugin.onLoad({ filter: /event-owner-rows\.tsrx$/ }, () => ({
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
	const { Rows, createRoot, flushSync } = await import(pathToFileURL(output).href);

	// Count weak-map insertions only inside the measured commits.
	const nativeSet = WeakMap.prototype.set;
	let weakWrites = 0;
	const counted = (work) => {
		weakWrites = 0;
		WeakMap.prototype.set = function (key, value) {
			weakWrites++;
			return nativeSet.call(this, key, value);
		};
		try {
			work();
		} finally {
			WeakMap.prototype.set = nativeSet;
		}
		return weakWrites;
	};
	const rowsFrom = (start, count) =>
		Array.from({ length: count }, (_, i) => ({ id: start + i, label: 'row ' + (start + i) }));
	const click = (container, id) =>
		flushSync(() =>
			container
				.querySelector(`button[data-id="${id}"]`)
				.dispatchEvent(new MouseEvent('click', { bubbles: true })),
		);
	const picked = (container) =>
		[...container.querySelectorAll('li.picked button')].map((button) => button.dataset.id);

	const mountWrites = {};
	let insertWrites;
	let semantic;
	for (const count of [SMALL, LARGE]) {
		const container = document.createElement('main');
		document.body.append(container);
		const view = createRoot(container);
		try {
			const rows = rowsFrom(0, count);
			mountWrites[count] = counted(() => flushSync(() => view.render(Rows, { rows })));
			const buttons = [...container.querySelectorAll('button')];
			assert.equal(buttons.length, count);
			click(container, count - 1);
			assert.deepEqual(picked(container), [String(count - 1)], 'mounted handlers dispatch');
			if (count === LARGE) {
				const next = rowsFrom(-INSERTED, INSERTED).concat(rows);
				insertWrites = counted(() => flushSync(() => view.render(Rows, { rows: next })));
				const after = [...container.querySelectorAll('button')];
				assert.equal(after.length, LARGE + INSERTED);
				for (let i = 0; i < LARGE; i++)
					assert.equal(after[INSERTED + i], buttons[i], 'surviving button identity');
				click(container, -INSERTED);
				assert.deepEqual(picked(container), [String(-INSERTED)], 'inserted handlers dispatch');
				click(container, 0);
				assert.deepEqual(picked(container), ['0'], 'surviving handlers dispatch');
				semantic = hash(container.innerHTML);
			}
		} finally {
			view.unmount();
			container.remove();
		}
	}
	const rowWrites = (mountWrites[LARGE] - mountWrites[SMALL]) / (LARGE - SMALL);
	const insertedWrites = insertWrites / INSERTED;
	const value = (median) => ({ median, min: median, samples: 1 });
	payload = {
		suite: 'signal-dom-bindings',
		targets: [
			{
				name: 'event-owner-rows',
				ops: {
					mount_row_weak_writes: value(rowWrites),
					insert_row_weak_writes: value(insertedWrites),
				},
				meta: { gate: 'passed', mountWrites, insertWrites, semantic },
			},
			{
				// One insertion per row is the smallest budget a weak-map record could use.
				name: 'event-owner-rows-work-budget',
				ops: { mount_row_weak_writes: value(1), insert_row_weak_writes: value(1) },
				meta: { gate: 'passed' },
			},
		],
		meta: {
			node: process.version,
			fixtureSha256: hash(source),
			compiledSha256: hash(compiled),
			bundleSha256: hash(code),
			limits:
				'Counts WeakMap.prototype.set calls in happy-dom, per row, as the difference between two mount sizes; not heap allocation or timing.',
		},
	};
	console.log(JSON.stringify(payload, null, 2));
} catch (error) {
	payload = { suite: 'signal-dom-bindings', failed: error.stack ?? String(error) };
	throw error;
} finally {
	if (payload && process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
	for (const [name, descriptor] of priorGlobals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else delete globalThis[name];
	}
	dom.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
