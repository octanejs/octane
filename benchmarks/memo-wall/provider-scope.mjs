// Same-context sibling providers must not turn an unchanged memo wall into a
// full consumer refresh. Counts belong here; visible values and retained hosts
// are semantic controls. --measure records a historical runtime without gates.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const repo = path.resolve(import.meta.dirname, '../..');
const runtimePath = path.join(repo, 'packages/octane/src/runtime.ts');
const runtimeFile = path.resolve(process.argv.find((arg) => arg.endsWith('.ts')) ?? runtimePath);
const source = fs.readFileSync(runtimeFile, 'utf8');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-context-provider-'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const window = new Window();
for (const name of [
	'window',
	'document',
	'Node',
	'Element',
	'HTMLElement',
	'SVGElement',
	'Comment',
	'Text',
	'Event',
	'MouseEvent',
	'MutationObserver',
])
	globalThis[name] = name === 'window' ? window : window[name];
const result = await build({
	absWorkingDir: repo,
	stdin: {
		contents:
			"export {createRoot, createElement, createContext, useContext, memo, flushSync} from './packages/octane/src/runtime.ts';",
		resolveDir: repo,
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'browser',
	minify: true,
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	plugins: [
		{
			name: 'runtime-comparison',
			setup(plugin) {
				plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: loaded }) =>
					loaded === runtimePath
						? { contents: source, loader: 'ts', resolveDir: path.dirname(runtimePath) }
						: null,
				);
			},
		},
	],
});
const bundle = path.join(scratch, 'runtime.mjs');
fs.writeFileSync(bundle, result.outputFiles[0].text);
const {
	createRoot,
	createElement: h,
	createContext,
	useContext,
	memo,
	flushSync,
} = await import(pathToFileURL(bundle).href);
const Context = createContext('default');
let reads = 0;
function Leaf({ id }) {
	reads++;
	return h('span', { 'data-id': id }, useContext(Context));
}
const Wall = memo(function Wall({ count }) {
	return h(
		'section',
		null,
		Array.from({ length: count }, (_, id) => h(Leaf, { key: id, id })),
	);
});
function App({ count, first, second, tick, siblingFirst }) {
	const retained = h(Context, { key: 'retained', value: first }, h(Wall, { count }));
	const sibling = h(Context, { key: 'sibling', value: second }, h('aside', null, second));
	return h(
		'main',
		{ 'data-tick': tick },
		...(siblingFirst ? [sibling, retained] : [retained, sibling]),
	);
}
const targets = [];
for (const count of [128, 512]) {
	const unaffected = [];
	const changed = [];
	for (const siblingFirst of [false, true]) {
		const host = document.createElement('div');
		document.body.append(host);
		const root = createRoot(host);
		const render = (first, second, tick) =>
			flushSync(() => root.render(App, { count, first, second, tick, siblingFirst }));
		render('retained', 'sibling-a', 0);
		const nodes = [...host.querySelectorAll('span')];
		reads = 0;
		render('retained', 'sibling-b', 1);
		render('retained', 'sibling-b', 2);
		unaffected.push(reads);
		assert.deepEqual(
			[...host.querySelectorAll('span')].map((n) => n.textContent),
			Array(count).fill('retained'),
		);
		assert.deepEqual([...host.querySelectorAll('span')], nodes);
		reads = 0;
		render('changed', 'sibling-b', 3);
		changed.push(reads);
		assert.deepEqual(
			[...host.querySelectorAll('span')].map((n) => n.textContent),
			Array(count).fill('changed'),
		);
		assert.deepEqual([...host.querySelectorAll('span')], nodes);
		root.unmount();
		host.remove();
	}
	const value = (values) => ({
		median: (values[0] + values[1]) / 2,
		min: Math.min(...values),
		samples: values.length,
	});
	for (const [kind, renders] of [
		['unaffected', unaffected],
		['changed', changed],
	])
		targets.push({
			name: `provider-scope-${kind}-${count}`,
			ops: { consumer_renders: value(renders) },
			meta: {
				semantic: 'both sibling orders; nearest values and retained hosts verified',
				renders,
			},
		});
}
const report = {
	suite: 'memo-wall',
	targets,
	meta: {
		node: process.version,
		runtimeSha256: hash(source),
		bundleSha256: hash(result.outputFiles[0].text),
	},
};
if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await window.happyDOM.close();
fs.rmSync(scratch, { recursive: true, force: true });
if (!process.argv.includes('--measure'))
	for (const target of targets)
		if (target.name.includes('-unaffected-'))
			assert.equal(
				target.ops.consumer_renders.median,
				0,
				'sibling provider leaves the retained wall bailed',
			);
