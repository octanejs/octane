// Observe reached input-journal entries in real keyed rows. A compiler-ABI
// adapter controls item and environment identities independently; row markup,
// hooks, and native events are compiled through the public compiler.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import ts from 'typescript';
import { compile } from '../../packages/octane/src/compiler/compile.js';

process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const runtimeFile = path.resolve(
	process.argv[2] ?? path.join(repo, 'packages/octane/src/runtime.ts'),
);
const runtimePath = path.join(repo, 'packages/octane/src/runtime.ts');
const runtimeSource = fs.readFileSync(runtimeFile, 'utf8');
const ast = ts.createSourceFile(runtimePath, runtimeSource, ts.ScriptTarget.Latest, true);
const survivor = ast.statements.find(
	(node) => ts.isFunctionDeclaration(node) && node.name?.text === 'updateSurvivor',
);
assert.ok(survivor?.body, 'survivor update body');
const insertions = [];
function walk(node) {
	if (ts.isCallExpression(node)) {
		const name = node.expression.getText(ast);
		const property = node.arguments[1];
		const legacyInput =
			name === 'journalRootProperty' &&
			ts.isStringLiteral(property) &&
			['props', 'extra'].includes(property.text);
		const pairedInput =
			name.endsWith('.push') && node.arguments[0]?.getText(ast) === 'JOURNAL_INPUTS';
		if (legacyInput || pairedInput) {
			insertions.push(
				[node.getStart(ast), '(globalThis.__inputJournalSlots += 4, '],
				[node.end, ')'],
			);
		}
	}
	ts.forEachChild(node, walk);
}
walk(survivor.body);
assert.ok(
	insertions.length === 2 || insertions.length === 4,
	'one paired site or two legacy sites',
);
let observedRuntime = runtimeSource;
for (const [offset, text] of insertions.sort((a, b) => b[0] - a[0]))
	observedRuntime = observedRuntime.slice(0, offset) + text + observedRuntime.slice(offset);
const source = `import {useState} from 'octane';
export function Row({item, environment}) @{
 const [count, setCount] = useState(0);
 <button data-row={item.id} onClick={() => setCount(count + 1)}>{item.label + ':' + environment + ':' + count}</button>
}`;
const compiled = compile(source, 'root-inputs-row.tsrx', { dev: false, hmr: false }).code;
const adapter = `import {bag1, clone, forBlock, template} from 'octane';
const hostTemplate = template('<section></section>');
const key = item => item.id;
function rowBody(item, scope, environment) { Row({item, environment: environment[0]}, scope); }
export function App(props, scope) {
 let bindings = scope.slots[0];
 if (bindings === undefined) { const host = clone(hostTemplate); bindings = bag1(scope, host, host); }
 forBlock(scope, 1, bindings.a, props.rows, key, rowBody, 8, props.environment);
}
export {createRoot, flushSync} from 'octane';`;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-root-inputs-'));
const window = new Window();
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
])
	globalThis[name] = name === 'window' ? window : window[name];
const results = [];
let size;
try {
	for (const observed of [false, true]) {
		const outfile = path.join(scratch, `${observed}.mjs`);
		const bundled = await build({
			stdin: { contents: compiled + '\n' + adapter, resolveDir: repo, loader: 'js' },
			outfile,
			bundle: true,
			format: 'esm',
			platform: 'node',
			minify: true,
			write: false,
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: [
				{
					name: 'selected-runtime',
					setup(plugin) {
						plugin.onResolve(
							{ filter: /^octane(?:\/internal\/client)?$/ },
							({ path: request }) => ({
								path: path.join(
									repo,
									'packages/octane/src',
									request === 'octane' ? 'index.ts' : 'internal/client.ts',
								),
							}),
						);
						plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: loaded }) =>
							loaded === runtimePath
								? {
										contents: observed ? observedRuntime : runtimeSource,
										loader: 'ts',
										resolveDir: path.dirname(runtimePath),
									}
								: null,
						);
					},
				},
			],
		});
		fs.writeFileSync(outfile, bundled.outputFiles[0].text);
		if (!observed)
			size = {
				minified: bundled.outputFiles[0].contents.length,
				gzip: gzipSync(bundled.outputFiles[0].contents).length,
			};
		const { App, createRoot, flushSync } = await import(pathToFileURL(outfile));
		const result = {};
		for (const mode of ['both', 'props-only', 'environment-only', 'unchanged']) {
			const rows = Array.from({ length: 256 }, (_, id) => ({ id, label: 'old-' + id }));
			const environment = ['before'];
			const container = document.createElement('main');
			document.body.append(container);
			const root = createRoot(container);
			root.render(App, { rows, environment });
			flushSync(() => {});
			const initial = Array.from(container.querySelectorAll('button'));
			assert.equal(initial.length, rows.length);
			flushSync(() => initial[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
			assert.equal(initial[0].textContent, 'old-0:before:1');
			const changesProps = mode === 'both' || mode === 'props-only';
			const changesEnv = mode === 'both' || mode === 'environment-only';
			const nextRows = changesProps
				? rows.map((row) => ({ ...row, label: 'new-' + row.id }))
				: rows;
			const nextEnvironment = changesEnv ? ['after'] : environment;
			globalThis.__inputJournalSlots = 0;
			flushSync(() => root.render(App, { rows: nextRows, environment: nextEnvironment }));
			const slots = globalThis.__inputJournalSlots;
			const current = Array.from(container.querySelectorAll('button'));
			assert.equal(current.length, rows.length);
			for (let id = 0; id < rows.length; id++) {
				assert.equal(current[id], initial[id], 'surviving button identity');
				assert.equal(
					current[id].textContent,
					`${nextRows[id].label}:${nextEnvironment[0]}:${id === 0 ? 1 : 0}`,
				);
			}
			flushSync(() => current[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
			assert.equal(
				current[0].textContent,
				`${nextRows[0].label}:${nextEnvironment[0]}:2`,
				'surviving hook state and updated event closure',
			);
			result[mode] = {
				slots,
				budget: mode === 'unchanged' ? 0 : rows.length * 4,
				semantic: current.map((node) => node.textContent).join('|'),
			};
			root.unmount();
			assert.equal(container.childNodes.length, 0);
			container.remove();
		}
		results.push(result);
	}
	for (const mode of Object.keys(results[0]))
		assert.equal(results[0][mode].semantic, results[1][mode].semantic);
	const value = (median) => ({ median, min: median, samples: 1 });
	const report = {
		suite: 'root-transactions',
		runtimeFile,
		runtimeSha256: createHash('sha256').update(runtimeSource).digest('hex'),
		sourceSha256: createHash('sha256')
			.update(source + adapter)
			.digest('hex'),
		node: process.version,
		size,
		results: results[1],
		targets: Object.entries(results[1]).flatMap(([mode, result]) => [
			{
				name: `inputs-${mode}`,
				ops: { input_slots: value(result.slots) },
				meta: { gate: 'passed', semantic: result.semantic },
			},
			{
				name: `inputs-${mode}-work`,
				ops: { input_slots: value(256 * 4) },
				meta: { gate: 'passed' },
			},
		]),
		limitations: [
			'Reached input-journal entries times their four flat slots count source work, not heap allocations or timing.',
			'Compiled rows use the public compiler; a compiler-ABI adapter controls capture tuple identity independently.',
		],
	};
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
} finally {
	await window.happyDOM.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
