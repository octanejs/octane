// Public compiled branches, with counters added only after clean tree shaking.
// Observed bundles prove reached hydration-lookup work; clean bundles own timing.
process.env.NODE_ENV = 'production';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { build, transformSync } from 'esbuild';
import { createRequire } from 'node:module';
import { Window } from 'happy-dom';

const repo = path.resolve(import.meta.dirname, '../..');
const dependencies = createRequire(path.join(repo, 'packages/octane/package.json'));
const { parseModule, builders: b } = dependencies('@tsrx/core');
const { print } = dependencies('esrap');
const tsx = dependencies('esrap/languages/tsx').default;
const sourceRoot = path.resolve(process.env.CLIENT_SOURCE_ROOT ?? process.argv[2] ?? repo);
const compilerRoot = path.resolve(process.env.CLIENT_COMPILER_ROOT ?? repo);
const runtimeFile = path.resolve(
	process.env.CLIENT_RUNTIME_FILE ?? path.join(sourceRoot, 'packages/octane/src/runtime.ts'),
);
const selectedRuntime = fs.readFileSync(runtimeFile, 'utf8');
const { compile } = await import(
	pathToFileURL(path.join(compilerRoot, 'packages/octane/src/compiler/compile.js'))
);
const count = 32;
const cycles = Number(process.env.BRANCH_CYCLES ?? 128);
const samples = Number(process.env.BRANCH_SAMPLES ?? 7);
const warmup = Number(process.env.BRANCH_WARMUP ?? 128);
const observer = '__octaneBranchWork';
const source = `import { useState, useLayoutEffect } from 'octane';
export function App(props) @{
  const [tick, setTick] = useState(0);
  props.bind(setTick);
  const label = props.label + ':' + tick;
  const active = props.mode === 'absent' ? false : props.mode !== 'toggle' || tick % 2 === 0;
  useLayoutEffect(() => { props.effect(label); return () => props.cleanup(); }, [label]);
  <section>${Array.from({ length: count }, (_, index) =>
		index % 2 === 0
			? `@if (active) { <button data-row="${index}" title={label} onClick={() => props.pick(label)}>{label}</button> }`
			: `@switch (active) { @case true: { <button data-row="${index}" title={label} onClick={() => props.pick(label)}>{label}</button> } }`,
	).join('\n')}</section>
}`;
const compiled = compile(source, 'client-branches.tsrx', {
	mode: 'client',
	dev: false,
	hmr: false,
}).code;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const skipped = new Set(['loc', 'start', 'end', 'metadata', 'comments', 'tokens']);
const branchFunctions = new Set([
	'ifBlock',
	'switchBlock',
	'renderBranchSlot',
	'renderChangedBranchSlot',
]);
function observe(code) {
	let sites = 0;
	function visit(node, owner = null) {
		if (Array.isArray(node)) return node.map((child) => visit(child, owner));
		if (node === null || typeof node !== 'object' || typeof node.type !== 'string') return node;
		const current = node.type === 'FunctionDeclaration' ? node.id?.name : owner;
		let result = node;
		for (const key of Object.keys(node)) {
			if (skipped.has(key)) continue;
			const child = node[key];
			if (child === null || typeof child !== 'object') continue;
			const next = visit(child, current);
			if (next !== child) {
				if (result === node) result = { ...node };
				result[key] = next;
			}
		}
		if (
			branchFunctions.has(current) &&
			node.type === 'CallExpression' &&
			node.callee.type === 'Identifier' &&
			node.callee.name === 'activeHydration'
		) {
			sites++;
			return b.sequence([
				b.update('++', b.member(b.member(b.id('globalThis'), observer), 'hydrationLookups')),
				result,
			]);
		}
		return result;
	}
	const program = parseModule(code, { filename: 'client-branches.mjs' });
	const edited = visit(program);
	assert.equal(sites, 3, 'observe all three branch-owned hydration lookups');
	return print(edited, tsx()).code;
}
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-client-branches-'));
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
])
	globalThis[name] = name === 'window' ? window : window[name];
try {
	const built = await build({
		stdin: {
			contents: compiled + '\nexport { createRoot, flushSync } from "octane";',
			resolveDir: repo,
		},
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [path.join(repo, 'packages/octane/node_modules'), path.join(repo, 'node_modules')],
		plugins: [
			{
				name: 'selected-client-runtime',
				setup(plugin) {
					plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: filename }) =>
						filename === path.join(sourceRoot, 'packages/octane/src/runtime.ts')
							? { contents: selectedRuntime, loader: 'ts' }
							: undefined,
					);
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
	const clean = transformSync(built.outputFiles[0].text, { minify: true, target: 'es2022' }).code;
	if (process.env.BRANCH_BUNDLE_DIRECTORY) {
		fs.mkdirSync(process.env.BRANCH_BUNDLE_DIRECTORY, { recursive: true });
		fs.writeFileSync(path.join(process.env.BRANCH_BUNDLE_DIRECTORY, 'branches.mjs'), clean);
		fs.writeFileSync(path.join(process.env.BRANCH_BUNDLE_DIRECTORY, 'fixture.tsrx'), source);
	}
	const observed = observe(built.outputFiles[0].text);
	const results = [];
	for (const instrumented of [false, true]) {
		const filename = path.join(scratch, instrumented ? 'observed.mjs' : 'clean.mjs');
		fs.writeFileSync(filename, instrumented ? observed : clean);
		globalThis[observer] = { hydrationLookups: 0 };
		const api = await import(pathToFileURL(filename));
		for (const mode of ['stable', 'toggle', 'absent', 'mount']) {
			const container = document.createElement('div');
			document.body.appendChild(container);
			let root = api.createRoot(container);
			let update;
			let effectLabel;
			let effects = 0;
			let cleanups = 0;
			let pick;
			const props = {
				mode,
				label: 'value',
				bind(value) {
					update = value;
				},
				effect(value) {
					effects++;
					effectLabel = value;
				},
				cleanup() {
					cleanups++;
				},
				pick(value) {
					pick = value;
				},
			};
			root.render(api.App, props);
			api.flushSync(() => {});
			const original = [...container.querySelectorAll('button')];
			let tick = 0;
			const render = () => {
				if (mode === 'mount') {
					root.unmount();
					root = api.createRoot(container);
					root.render(api.App, { ...props, label: `value-${++tick}` });
					api.flushSync(() => {});
				} else api.flushSync(() => update(++tick));
			};
			for (let i = 0; i < warmup; i++) render();
			globalThis[observer] = { hydrationLookups: 0 };
			const timings = [];
			for (let sample = 0; sample < samples; sample++) {
				const start = performance.now();
				for (let index = 0; index < cycles; index++) render();
				timings.push((performance.now() - start) / cycles);
			}
			const buttons = [...container.querySelectorAll('button')];
			const label = mode === 'mount' ? `value-${tick}:0` : `value:${tick}`;
			const active = mode !== 'absent' && (mode !== 'toggle' || tick % 2 === 0);
			assert.equal(buttons.length, active ? count : 0, `${mode}: active output`);
			for (const [index, button] of buttons.entries()) {
				assert.equal(button.textContent, label);
				assert.equal(button.title, label);
				if (mode === 'stable') assert.equal(button, original[index], 'same-arm DOM identity');
				if (mode === 'toggle' || mode === 'mount')
					assert.notEqual(button, original[index], 'reentered arms mount fresh DOM');
				button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				assert.equal(pick, label, 'current event capture');
			}
			assert.equal(effectLabel, label, 'current layout effect');
			assert.equal(effects, cleanups + 1, 'one connected effect');
			const work = { ...globalThis[observer] };
			const semantic = { text: container.textContent, buttons: buttons.length, effects, cleanups };
			root.unmount();
			assert.equal(container.childNodes.length, 0, 'root cleanup');
			assert.equal(effects, cleanups, 'balanced effect cleanup');
			container.remove();
			results.push({ instrumented, mode, work, semantic, ...(instrumented ? {} : { timings }) });
		}
	}
	for (const mode of ['stable', 'toggle', 'absent', 'mount'])
		assert.deepEqual(
			results.find((row) => !row.instrumented && row.mode === mode).semantic,
			results.find((row) => row.instrumented && row.mode === mode).semantic,
			`${mode}: observer preserves behavior`,
		);
	const stamp = (value) => ({ score: value, median: value, min: value, samples: 1 });
	const report = {
		suite: 'client-hot-paths',
		iterations: cycles * samples,
		node: process.version,
		sourceRoot,
		compilerRoot,
		runtimeSha256: hash(fs.readFileSync(runtimeFile)),
		sourceSha256: hash(source),
		compiledSha256: hash(compiled),
		bundle: { minified: Buffer.byteLength(clean), gzip: gzipSync(clean).length },
		results,
		targets: results
			.filter((row) => row.instrumented)
			.flatMap((row) => [
				{
					name: `branches-${row.mode}`,
					ops: { hydration_lookups: stamp(row.work.hydrationLookups) },
				},
				{
					name: `branches-${row.mode}-work-budget`,
					ops: {
						hydration_lookups: stamp(count * cycles * samples * (row.mode === 'mount' ? 2 : 1)),
					},
				},
			]),
	};
	const json = JSON.stringify(report, null, 2) + '\n';
	if (process.env.BENCH_JSON) fs.writeFileSync(path.resolve(process.env.BENCH_JSON), json);
	console.log(json.trimEnd());
} finally {
	delete globalThis[observer];
	await window.happyDOM.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
