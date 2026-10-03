// Deterministic per-row work of memo-wall's one_change_B shape: a plain-JS
// helper re-creates a createElement(memo(Row), props) descriptor for every row,
// the list reaches the DOM through a `{rows}` children hole, and one row's value
// changes while the rest bail on equal props. Each count is the difference
// between two list sizes divided by the extra rows, so per-commit constants
// cancel and only the cost of one more bailed survivor remains.
//
// - bailed_row_journal_slots: root-journal slots the commit holds per bailed row.
// - bailed_row_calls: production-bundle function calls per bailed row, from V8
//   precise call coverage in a --jitless process (inlining cannot hide a call).
//
// Usage: node survivor-work.mjs [runtime.ts], where the optional runtime source
// replaces packages/octane/src/runtime.ts for an old-vs-new comparison.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { Session } from 'node:inspector/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.execArgv.includes('--jitless')) {
	const child = spawnSync(
		process.execPath,
		['--jitless', ...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
		{ stdio: 'inherit', env: process.env },
	);
	process.exit(child.status ?? 1);
}

const { build } = await import('esbuild');
const { Window } = await import('happy-dom');
const { compile } = await import('../../packages/octane/src/compiler/compile.js');

const here = import.meta.dirname;
const repo = path.resolve(here, '../..');
const runtimePath = path.join(repo, 'packages/octane/src/runtime.ts');
const runtimeFile = path.resolve(process.argv[2] ?? runtimePath);
const runtimeSource = fs.readFileSync(runtimeFile, 'utf8');
const commitSite = 'ROOT_RENDER_TRANSACTIONS = [];\n\tfor (const transaction of transactions) {';
assert.equal(runtimeSource.split(commitSite).length, 2, 'one root commit loop');
const observedRuntime = runtimeSource.replace(
	commitSite,
	commitSite + '\n\t\tglobalThis.__rootJournalSlots += transaction.log.length;',
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const exportsMap = JSON.parse(
	fs.readFileSync(path.join(repo, 'packages/octane/package.json')),
).exports;

// Row mirrors memo-wall's wall B: four primitive props and a module callback.
const rowSource = `import { memo } from 'octane';
function RowImpl(props: { id: number; label: string; value: number; wall: string; onSelect: () => void }) @{
	globalThis.__rowRenders++;
	<li data-id={props.id} onClick={props.onSelect}>{props.label + ':' + props.value + ':' + props.wall}</li>
}
export const Row = memo(RowImpl);
export function Wall(props: { rows: unknown }) @{
	<ul>{props.rows}</ul>
}`;
const helperSource = `import { createElement } from 'octane';
import { Row } from './survivor-rows.tsrx';
export function buildRows(items, onSelect) {
	const out = new Array(items.length);
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		out[i] = createElement(Row, { key: it.id, id: it.id, label: it.label, value: it.value, wall: 'B', onSelect });
	}
	return out;
}`;
const compiled = compile(rowSource, 'survivor-rows.tsrx', { dev: false, hmr: false }).code;
const SIZES = [128, 256];
const CHANGED = 7;

// Coverage reports the module's real path; macOS temp directories are symlinks.
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octane-memo-survivors-')));
const window = new Window();
const globals = [
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
];
const priorGlobals = new Map();
const session = new Session();
let report;
try {
	for (const name of globals) {
		priorGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === 'window' ? window : window[name],
		});
	}
	const bundled = await build({
		absWorkingDir: repo,
		stdin: {
			contents: `export { Wall } from './survivor-rows.tsrx'; export { buildRows } from './survivor-build.js'; export { createRoot, flushSync } from 'octane';`,
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
				name: 'survivor-fixture',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const target = exportsMap[request === 'octane' ? '.' : '.' + request.slice(6)];
						assert.equal(typeof target, 'string', 'public authored source export');
						return { path: path.resolve(repo, 'packages/octane', target) };
					});
					plugin.onResolve(
						{ filter: /^\.\/survivor-(rows\.tsrx|build\.js)$/ },
						({ path: request }) => ({
							path: path.join(here, request),
						}),
					);
					plugin.onLoad({ filter: /survivor-rows\.tsrx$/ }, () => ({
						contents: compiled,
						loader: 'js',
						resolveDir: here,
					}));
					plugin.onLoad({ filter: /survivor-build\.js$/ }, () => ({
						contents: helperSource,
						loader: 'js',
						resolveDir: here,
					}));
					plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: loaded }) =>
						loaded === runtimePath
							? { contents: observedRuntime, loader: 'ts', resolveDir: path.dirname(runtimePath) }
							: null,
					);
				},
			},
		],
	});
	const code = bundled.outputFiles[0].text;
	const bundleFile = path.join(scratch, 'fixture.mjs');
	fs.writeFileSync(bundleFile, code);
	const bundleUrl = pathToFileURL(bundleFile).href;

	session.connect();
	await session.post('Profiler.enable');
	await session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
	const calls = async () => {
		const { result } = await session.post('Profiler.takePreciseCoverage');
		let total = 0;
		for (const script of result) {
			if (script.url !== bundleUrl) continue;
			for (const fn of script.functions) total += fn.ranges[0]?.count ?? 0;
		}
		return total;
	};

	const { Wall, buildRows, createRoot, flushSync } = await import(bundleUrl);
	const onSelect = () => {};
	const itemsOf = (count, changed = -1) =>
		Array.from({ length: count }, (_, id) => ({
			id,
			label: 'row ' + id,
			value: id === changed ? -1 : id,
		}));
	const measured = { slots: {}, calls: {} };
	let semantic;
	for (const count of SIZES) {
		const container = document.createElement('main');
		document.body.append(container);
		const root = createRoot(container);
		try {
			globalThis.__rowRenders = 0;
			flushSync(() => root.render(Wall, { rows: buildRows(itemsOf(count), onSelect) }));
			assert.equal(globalThis.__rowRenders, count, 'mount renders every row');
			const hosts = [...container.querySelectorAll('li')];
			// Warm the update path once, so lazy one-time setup is not counted.
			flushSync(() => root.render(Wall, { rows: buildRows(itemsOf(count), onSelect) }));
			globalThis.__rowRenders = 0;
			globalThis.__rootJournalSlots = 0;
			const items = itemsOf(count, CHANGED);
			// Settle microtasks an earlier commit or unmount queued, then reset the counts.
			await new Promise((resolve) => setImmediate(resolve));
			await calls();
			flushSync(() => root.render(Wall, { rows: buildRows(items, onSelect) }));
			measured.calls[count] = await calls();
			measured.slots[count] = globalThis.__rootJournalSlots;
			assert.equal(globalThis.__rowRenders, 1, 'only the changed row renders');
			const after = [...container.querySelectorAll('li')];
			assert.equal(after.length, count);
			after.forEach((host, i) => assert.equal(host, hosts[i], 'rows keep their hosts'));
			assert.equal(after[CHANGED].textContent, `row ${CHANGED}:-1:B`);
			assert.equal(after[CHANGED + 1].textContent, `row ${CHANGED + 1}:${CHANGED + 1}:B`);
			if (count === SIZES[1]) semantic = hash(container.innerHTML);
		} finally {
			root.unmount();
			container.remove();
		}
	}
	const perRow = (counts) => (counts[SIZES[1]] - counts[SIZES[0]]) / (SIZES[1] - SIZES[0]);
	const value = (median) => ({ median, min: median, samples: 1 });
	const slotsPerRow = perRow(measured.slots);
	const callsPerRow = perRow(measured.calls);
	report = {
		suite: 'memo-wall',
		targets: [
			{
				name: 'survivor-work',
				ops: {
					bailed_row_journal_slots: value(slotsPerRow),
					bailed_row_calls: value(callsPerRow),
				},
				meta: { gate: 'passed', measured, semantic },
			},
			{
				// A row-scaled journal record is at least one slot per row. The 26
				// calls create and key the descriptor, visit the survivor, and take
				// the memo bail; entering the item's own render cost 48 and 8 slots.
				name: 'survivor-work-budget',
				ops: { bailed_row_journal_slots: value(1), bailed_row_calls: value(26) },
				meta: { gate: 'passed' },
			},
		],
		meta: {
			node: process.version,
			runtimeFile: path.relative(repo, runtimeFile),
			runtimeSha256: hash(runtimeSource),
			fixtureSha256: hash(rowSource + helperSource),
			bundleSha256: hash(code),
			limits:
				'Counts root-journal slots and jitless production-bundle calls per bailed value-position memo row, as the difference between two list sizes in happy-dom; not timing.',
		},
	};
	console.log(JSON.stringify(report, null, 2));
} catch (error) {
	report = { suite: 'memo-wall', failed: error.stack ?? String(error) };
	throw error;
} finally {
	if (report && process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n');
	session.disconnect();
	for (const [name, descriptor] of priorGlobals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else delete globalThis[name];
	}
	await window.happyDOM.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
