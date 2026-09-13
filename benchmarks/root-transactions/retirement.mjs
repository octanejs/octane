// Count reached retirement bookkeeping sites in a production runtime. Instrumented
// and clean modules must produce the same public DOM, identity, and cleanup result.
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
const runtimeSource = fs.readFileSync(runtimeFile, 'utf8');
const runtimePath = path.join(repo, 'packages/octane/src/runtime.ts');
const ast = ts.createSourceFile(runtimePath, runtimeSource, ts.ScriptTarget.Latest, true);
const retire = ast.statements.find(
	(node) => ts.isFunctionDeclaration(node) && node.name?.text === 'retireRootBlock',
);
assert.ok(retire?.body, 'retireRootBlock body');
let closures = 0;
const walk = (node) => {
	if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) closures++;
	ts.forEachChild(node, walk);
};
walk(retire.body);
const body = runtimeSource.slice(retire.body.pos, retire.body.end);
assert.equal(body.split('retired.add(block);').length, 2, 'one new-retirement site');
const observedRuntime =
	runtimeSource.slice(0, retire.body.pos) +
	body.replace('retired.add(block);', 'retired.add(block); globalThis.__retirementCount++;') +
	runtimeSource.slice(retire.body.end);
const source = `import { useLayoutEffect } from 'octane';
function Row(props) @{
  useLayoutEffect(() => () => props.cleanup(props.id), []);
  <><button data-row={props.id}>{String(props.id)}</button><span data-detail={props.id}>{'detail'}</span></>
}
export function App(props) @{
  <section>@for (const id of props.rows; key id) { <Row id={id} cleanup={props.cleanup} /> }</section>
}`;
const code = compile(source, 'root-retirement.tsrx', { dev: false, hmr: false }).code;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-root-retirement-'));
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
]) {
	globalThis[name] = name === 'window' ? window : window[name];
}
const rows = Array.from({ length: 256 }, (_, id) => id);
const results = [];
let size;
try {
	for (const observed of [false, true]) {
		const outfile = path.join(scratch, `${observed}.mjs`);
		const bundle = await build({
			stdin: {
				contents: code + '\nexport {createRoot, flushSync} from "octane";',
				resolveDir: repo,
				loader: 'js',
			},
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
		fs.writeFileSync(outfile, bundle.outputFiles[0].text);
		if (!observed)
			size = {
				minified: bundle.outputFiles[0].contents.length,
				gzip: gzipSync(bundle.outputFiles[0].contents).length,
			};
		const { App, createRoot, flushSync } = await import(pathToFileURL(outfile));
		const result = {};
		for (const mode of ['unchanged', 'remove-half', 'clear']) {
			const container = document.createElement('main');
			document.body.append(container);
			const root = createRoot(container);
			const cleanups = [];
			let initial;
			const cleanup = (id) => cleanups.push([id, initial[id].isConnected]);
			root.render(App, { rows, cleanup });
			flushSync(() => {});
			initial = Array.from(container.querySelectorAll('button'));
			globalThis.__retirementCount = 0;
			const next =
				mode === 'unchanged' ? rows : mode === 'clear' ? [] : rows.filter((id) => id % 2 === 0);
			flushSync(() => root.render(App, { rows: next, cleanup }));
			const retired = globalThis.__retirementCount;
			const current = Array.from(container.querySelectorAll('button'));
			assert.deepEqual(
				current.map((node) => Number(node.getAttribute('data-row'))),
				next,
			);
			for (let i = 0; i < next.length; i++)
				assert.equal(current[i], initial[next[i]], 'surviving button identity');
			assert.equal(container.querySelectorAll('span').length, next.length);
			assert.deepEqual(
				cleanups.map(([id]) => id).sort((a, b) => a - b),
				rows.filter((id) => !next.includes(id)),
			);
			assert.ok(
				cleanups.every(([, connected]) => connected),
				'outgoing cleanup sees connected DOM',
			);
			result[mode] = {
				retired,
				retirementClosures: retired * closures,
				removed: rows.length - next.length,
				semantic: next.join(','),
			};
			root.unmount();
			assert.equal(container.childNodes.length, 0);
			assert.equal(cleanups.length, rows.length, 'each cleanup runs once');
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
		sourceSha256: createHash('sha256').update(source).digest('hex'),
		node: process.version,
		size,
		results: results[1],
		targets: Object.entries(results[1]).flatMap(([mode, result]) => [
			{
				name: `retirement-${mode}`,
				ops: {
					retirement_closures: value(result.retirementClosures),
					retired: value(result.retired),
				},
				meta: { gate: 'passed', semantic: result.semantic },
			},
			{
				name: `retirement-${mode}-work`,
				ops: { retirement_closures: value(result.removed), retired: value(result.removed) },
				meta: { gate: 'passed' },
			},
		]),
		limitations: [
			'Retirement branch visits multiplied by verified closure literal sites measure source work, not heap allocations.',
			'Happy DOM checks public output and cleanup connectivity; this is not a browser timing measurement.',
		],
	};
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
} finally {
	await window.happyDOM.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
