// Counts reached array literal sites in compiled application code. Clean and
// observed modules run through the same public roots; no runtime is mocked.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { COUNTER_GLOBAL, emptyCounters, instrumentJavaScript } from '../hook-memo/instrument.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const SOURCE_REPO = path.resolve(process.argv[2] ?? REPO);
const compilerFile =
	process.env.OCTANE_BRANCH_COMPILER ??
	path.join(SOURCE_REPO, 'packages/octane/src/compiler/compile.js');
const { compile } = await import(pathToFileURL(compilerFile));
const DEPENDENCY_REPO = path.resolve(process.env.OCTANE_DEPENDENCY_REPO ?? REPO);
const dependencies = createRequire(path.join(DEPENDENCY_REPO, 'packages/octane/package.json'));
const { build, transformSync } = dependencies('esbuild');
const { parseModule, builders } = dependencies('@tsrx/core');
const { print } = dependencies('esrap');
const tsx = dependencies('esrap/languages/tsx').default;
const { Window } = await import(pathToFileURL(dependencies.resolve('happy-dom')));
const window = new Window({ url: 'http://localhost/' });
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
const CYCLES = 128;
const SOURCES = {
	direct:
		'export function App(props) @{ <section>@if (props.visible) { <span>{props.label}</span> }</section> }',
	folded:
		'export function App(props) { return <section>@if (props.visible) { <span>{props.label}</span> }</section>; }',
	nested:
		'export function App(props) @{ <section>@if (props.visible) { <div>@if (props.inner) { <span>{props.label}</span> }</div> }</section> }',
	twoArms:
		'export function App(props) @{ <section>@if (props.visible) { <span>{props.label}</span> } @else { <b>{props.label}</b> }</section> }',
	shadowed:
		'export function App(props) @{ const label = props.label; <section>@if (props.visible) { const label = "inner:" + props.label; <div>@if (props.inner) { <span>{label}</span> }</div> } @else { <b>{label}</b> }</section> }',
	argumentsEscape:
		'export function App(props) @{ <section>@if (props.visible) { props.observe(arguments); <div>@if (props.inner) { <span>{props.label}</span> }</div> }</section> }',
};
function renderProps(visible, label) {
	const props = {
		visible,
		inner: true,
		label,
		observe(args) {
			for (const value of args) {
				if (Array.isArray(value)) value.fill({ ...props, label: 'mutated' });
			}
		},
	};
	return props;
}
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-branch-environments-'));
const rows = [];
try {
	for (const [name, source] of Object.entries(SOURCES)) {
		const filename = `${name}.tsrx`;
		const { code } = compile(source, filename, { mode: 'client', dev: false, hmr: false });
		const minified = transformSync(code, { loader: 'js', minify: true }).code;
		const observedCode = instrumentJavaScript(code, filename, 'application', {
			parseModule,
			builders,
			print: (ast) => print(ast, tsx()).code,
		});
		const results = [];
		for (const observed of [false, true]) {
			const outfile = path.join(scratch, `${name}-${observed}.mjs`);
			await build({
				stdin: {
					contents:
						(observed ? observedCode : code) + '\nexport { createRoot, flushSync } from "octane";',
					resolveDir: REPO,
					loader: 'js',
				},
				outfile,
				bundle: true,
				format: 'esm',
				platform: 'node',
				logLevel: 'silent',
				define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
				nodePaths: [
					path.join(DEPENDENCY_REPO, 'node_modules'),
					path.join(DEPENDENCY_REPO, 'packages/octane/node_modules'),
				],
				plugins: [
					{
						name: 'source-runtime',
						setup(plugin) {
							plugin.onResolve(
								{ filter: /^octane(?:\/internal\/client)?$/ },
								({ path: request }) => ({
									path: path.join(
										SOURCE_REPO,
										'packages/octane/src',
										request === 'octane' ? 'index.ts' : 'internal/client.ts',
									),
								}),
							);
						},
					},
				],
			});
			globalThis[COUNTER_GLOBAL] = emptyCounters();
			const { App, createRoot, flushSync } = await import(pathToFileURL(outfile));
			const output = {};
			for (const active of [false, true]) {
				const container = document.createElement('div');
				document.body.appendChild(container);
				const root = createRoot(container);
				root.render(App, renderProps(active, 'warm'));
				globalThis[COUNTER_GLOBAL] = emptyCounters();
				for (let index = 0; index < CYCLES; index++) {
					flushSync(() => root.render(App, renderProps(active, `value-${index}`)));
				}
				const expected =
					active && name === 'shadowed'
						? 'inner:value-127'
						: active || name === 'twoArms' || name === 'shadowed'
							? 'value-127'
							: '';
				assert.equal(container.textContent, expected, `${name}/${active}: visible output`);
				output[active ? 'active' : 'absent'] = {
					text: container.textContent,
					arrays: globalThis[COUNTER_GLOBAL].application_arrayLiterals,
				};
				root.unmount();
				assert.equal(container.textContent, '');
				container.remove();
			}
			results.push(output);
		}
		assert.equal(results[0].active.text, results[1].active.text);
		assert.equal(results[0].absent.text, results[1].absent.text);
		rows.push({
			name,
			raw: code.length,
			minified: minified.length,
			gzip: gzipSync(minified).length,
			active_arrays: results[1].active.arrays,
			absent_arrays: results[1].absent.arrays,
		});
	}
	const stamp = (value) => ({ score: value, median: value, min: value, samples: 1 });
	const report = {
		suite: 'compiler-output',
		cycles: CYCLES,
		node: process.version,
		compiler: compilerFile,
		compilerSha256: createHash('sha256').update(fs.readFileSync(compilerFile)).digest('hex'),
		sourceSha256: createHash('sha256').update(JSON.stringify(SOURCES)).digest('hex'),
		rows,
		targets: rows.flatMap((row) => [
			{
				name: `branch-${row.name}`,
				ops: Object.fromEntries(
					Object.entries(row)
						.filter(([key]) => key !== 'name')
						.map(([key, value]) => [key, stamp(value)]),
				),
			},
			{
				name: `branch-${row.name}-work-budget`,
				ops: {
					active_arrays: stamp(
						CYCLES * (['shadowed', 'argumentsEscape'].includes(row.name) ? 2 : 1),
					),
					absent_arrays: stamp(['twoArms', 'shadowed'].includes(row.name) ? CYCLES : 1),
				},
			},
		]),
	};
	const output = JSON.stringify(report, null, 2) + '\n';
	if (process.env.BENCH_JSON) fs.writeFileSync(path.resolve(process.env.BENCH_JSON), output);
	console.log(output.trimEnd());
} finally {
	delete globalThis[COUNTER_GLOBAL];
	fs.rmSync(scratch, { recursive: true, force: true });
	await window.happyDOM.close();
}
