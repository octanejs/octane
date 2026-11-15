// Deterministic per-row work of an animated keyed list: every row wraps its
// host content in a ViewTransition boundary, the parent re-renders with a fresh
// rows array that keeps every row object but one, and the transition commits.
// Each count is the difference between two list sizes divided by the extra
// rows, so per-commit constants cancel and only the cost of one more unchanged
// row remains.
//
// - unchanged_row_bodies: row-body executions per unchanged row.
// - unchanged_row_calls: production-bundle function calls per unchanged row,
//   from V8 precise call coverage in a --jitless process.
//
// Usage: node benchmarks/view-transitions/boundary-rows.mjs [compiler.js], where
// the optional compiler source replaces packages/octane/src/compiler/compile.js
// for an old-vs-new comparison.
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

const here = import.meta.dirname;
const repo = path.resolve(here, '../..');
const compilerFile = path.resolve(
	process.argv[2] ?? path.join(repo, 'packages/octane/src/compiler/compile.js'),
);
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octane-vt-rows-')));
// compile.js imports its siblings and the package's dependencies relatively, so
// an alternate copy has to sit beside it to resolve the same modules.
const compilerCopy = path.join(
	repo,
	'packages/octane/src/compiler',
	`.bench-compile-${process.pid}.js`,
);
fs.copyFileSync(compilerFile, compilerCopy);
let compile;
try {
	({ compile } = await import(pathToFileURL(compilerCopy).href));
} finally {
	fs.rmSync(compilerCopy, { force: true });
}
const { build } = await import('esbuild');
const { Window } = await import('happy-dom');

const hash = (value) => createHash('sha256').update(value).digest('hex');
const exportsMap = JSON.parse(
	fs.readFileSync(path.join(repo, 'packages/octane/package.json')),
).exports;

const rowsSource = `import { ViewTransition } from 'octane';
export function List(props) @{
	const tone = props.tone;
	<ul>
		@for (const row of props.rows; key row.id) {
			<ViewTransition update="row">
				<li data-id={row.id} data-tone={tone}>{row.label as string}</li>
			</ViewTransition>
		}
	</ul>
}`;
const compiled = compile(rowsSource, 'boundary-rows.tsrx', { dev: false, hmr: false }).code;
const SIZES = [128, 256];
const CHANGED = 7;

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
			contents: `export { List } from './boundary-rows.tsrx'; export { createRoot, flushSync, startTransition } from 'octane';`,
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
				name: 'boundary-rows-fixture',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const target = exportsMap[request === 'octane' ? '.' : '.' + request.slice(6)];
						assert.equal(typeof target, 'string', 'public authored source export');
						return { path: path.resolve(repo, 'packages/octane', target) };
					});
					plugin.onResolve({ filter: /^\.\/boundary-rows\.tsrx$/ }, () => ({
						path: path.join(here, 'boundary-rows.tsrx'),
					}));
					plugin.onLoad({ filter: /boundary-rows\.tsrx$/ }, () => ({
						contents: compiled,
						loader: 'js',
						resolveDir: here,
					}));
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

	const { List, createRoot, flushSync, startTransition } = await import(bundleUrl);
	// The label getter counts row-body executions without putting a side effect in
	// the row, which the compiler would rightly refuse to cache.
	const rowOf = (id, label) => ({
		id,
		get label() {
			globalThis.__rowBodies++;
			return label;
		},
	});
	const rowsOf = (count) => Array.from({ length: count }, (_, id) => rowOf(id, 'row ' + id));
	const measured = { bodies: {}, calls: {} };
	let semantic;
	for (const count of SIZES) {
		const container = document.createElement('main');
		document.body.append(container);
		const root = createRoot(container);
		try {
			const rows = rowsOf(count);
			globalThis.__rowBodies = 0;
			flushSync(() => root.render(List, { rows, tone: 'a' }));
			assert.ok(globalThis.__rowBodies >= count, 'mount renders every row');
			const perBody = globalThis.__rowBodies / count;
			const hosts = [...container.querySelectorAll('li')];
			// Warm the update path once, so lazy one-time setup is not counted.
			flushSync(() => startTransition(() => root.render(List, { rows: [...rows], tone: 'a' })));
			const next = rows.map((row, i) => (i === CHANGED ? rowOf(row.id, 'changed') : row));
			await new Promise((resolve) => setImmediate(resolve));
			globalThis.__rowBodies = 0;
			await calls();
			flushSync(() => startTransition(() => root.render(List, { rows: next, tone: 'a' })));
			measured.calls[count] = await calls();
			measured.bodies[count] = globalThis.__rowBodies / perBody;
			const after = [...container.querySelectorAll('li')];
			assert.equal(after.length, count);
			after.forEach((host, i) => assert.equal(host, hosts[i], 'rows keep their hosts'));
			assert.equal(after[CHANGED].textContent, 'changed');
			assert.equal(after[CHANGED + 1].textContent, 'row ' + (CHANGED + 1));
			// A captured parent value must still reach every row.
			flushSync(() => startTransition(() => root.render(List, { rows: next, tone: 'b' })));
			assert.ok(
				[...container.querySelectorAll('li')].every((li) => li.dataset.tone === 'b'),
				'a changed capture re-renders every row',
			);
			if (count === SIZES[1]) semantic = hash(container.innerHTML);
		} finally {
			root.unmount();
			container.remove();
		}
	}
	const perRow = (counts) => (counts[SIZES[1]] - counts[SIZES[0]]) / (SIZES[1] - SIZES[0]);
	const value = (median) => ({ median, min: median, samples: 1 });
	report = {
		suite: 'view-transitions',
		targets: [
			{
				name: 'boundary-rows',
				ops: {
					unchanged_row_bodies: value(perRow(measured.bodies)),
					unchanged_row_calls: value(perRow(measured.calls)),
				},
				meta: { gate: 'passed', measured, semantic },
			},
		],
		meta: {
			node: process.version,
			compilerFile: path.relative(repo, compilerFile),
			compilerSha256: hash(fs.readFileSync(compilerFile)),
			fixtureSha256: hash(rowsSource),
			bundleSha256: hash(code),
			limits:
				'Counts row-body executions and jitless production-bundle calls per unchanged ViewTransition row of a keyed list, as the difference between two list sizes in happy-dom, where no native view transition runs; not timing.',
		},
	};
	console.log(JSON.stringify(report, null, 2));
} catch (error) {
	report = { suite: 'view-transitions', failed: error.stack ?? String(error) };
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
