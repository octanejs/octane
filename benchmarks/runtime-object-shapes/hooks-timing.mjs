import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Production-runtime controls. Structural interception and heap snapshots live
// in hooks.mjs and never run during these timing samples.
const args = process.argv.slice(2);
if (args[0] !== '--sample') {
	const outputIndex = args.indexOf('--output');
	const paths = args.slice(0, outputIndex === -1 ? undefined : outputIndex);
	if (paths.length < 2)
		throw new Error(
			'Usage: node hooks-timing.mjs <baseline.mjs> <candidate.mjs> [alternative.mjs] [--output report.json]',
		);
	const reports = Object.fromEntries(paths.map((path) => [resolve(path), []]));
	for (let round = 0; round < 9; round++) {
		// Rotate process order so the same design is not always measured first.
		for (let offset = 0; offset < paths.length; offset++) {
			const path = resolve(paths[(round + offset) % paths.length]);
			const sample = spawnSync(
				process.execPath,
				[fileURLToPath(import.meta.url), '--sample', path],
				{ encoding: 'utf8', maxBuffer: 1024 * 1024 },
			);
			if (sample.status !== 0) throw new Error(sample.stderr || sample.stdout);
			const marker = sample.stdout
				.split('\n')
				.find((line) => line.startsWith('OCTANE_HOOK_TIMING='));
			if (!marker) throw new Error('Missing hook timing sample');
			reports[path].push(JSON.parse(marker.slice('OCTANE_HOOK_TIMING='.length)));
		}
	}
	const json =
		JSON.stringify(
			{
				node: process.version,
				v8: process.versions.v8,
				metric:
					'Microseconds per complete public-root operation, including root/scope/DOM bookkeeping; no isolated property-read throughput claim.',
				samples: reports,
			},
			null,
			2,
		) + '\n';
	if (outputIndex !== -1) await writeFile(resolve(args[outputIndex + 1]), json);
	process.stdout.write(json);
} else {
	const { Window } = await import('happy-dom');
	const window = new Window({ url: 'http://localhost/' });
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
		'CustomEvent',
		'MutationObserver',
	])
		globalThis[name] = name === 'window' ? window : window[name];
	const runtime = await import(pathToFileURL(resolve(args[1])).href);
	const stateSlot = Symbol('state'),
		reducerSlot = Symbol('reducer'),
		memoSlot = Symbol('memo');
	const reducer = (value, action) => value + action;
	let latest,
		renders = 0,
		sum = 0;
	function Hooks(props) {
		const state = props.getters
			? runtime.__useStateWithGetter(0, stateSlot)
			: runtime.useState(0, stateSlot);
		const total = props.getters
			? runtime.__useReducerWithGetter(reducer, 0, undefined, reducerSlot)
			: runtime.useReducer(reducer, 0, undefined, reducerSlot);
		const memo = runtime.useMemo(
			() => ({ value: state[0] + total[0] }),
			[state[0], total[0]],
			memoSlot,
		);
		if (props.getters) sum += state[2]() + total[2]();
		latest = { state, total, memo };
		renders++;
		return null;
	}
	const result = {};
	try {
		for (const getters of [false, true]) {
			const prefix = getters ? 'getters' : 'ordinary';
			const mount = (count) => {
				for (let index = 0; index < count; index++) {
					const root = runtime.createRoot(document.createElement('div'));
					runtime.flushSync(() => root.render(Hooks, { getters, tick: index }));
					root.unmount();
				}
			};
			mount(500);
			let before = renders,
				begin = performance.now();
			mount(1500);
			result[prefix + 'Mount'] = ((performance.now() - begin) * 1000) / 1500;
			assert.equal(renders - before, 1500);
			assert.equal(latest.memo.value, 0);
			const root = runtime.createRoot(document.createElement('div'));
			runtime.flushSync(() => root.render(Hooks, { getters, tick: -1 }));
			const update = (count) => {
				for (let index = 0; index < count; index++)
					runtime.flushSync(() => root.render(Hooks, { getters, tick: index }));
			};
			update(4000);
			before = renders;
			begin = performance.now();
			update(10000);
			result[prefix + 'Update'] = ((performance.now() - begin) * 1000) / 10000;
			assert.equal(renders - before, 10000);
			assert.equal(latest.memo.value, 0);
			const transition = (count) => {
				for (let index = 0; index < count; index++) {
					runtime.startTransition(() => {
						latest.state[1](index + 1);
						latest.total[1](1);
					});
					runtime.flushSync(() => {});
				}
			};
			transition(500);
			const previousTotal = latest.total[0];
			begin = performance.now();
			transition(1500);
			result[prefix + 'Transition'] = ((performance.now() - begin) * 1000) / 1500;
			assert.equal(latest.state[0], 1500);
			assert.equal(latest.total[0], previousTotal + 1500);
			assert.equal(latest.memo.value, 1500 + previousTotal + 1500);
			root.unmount();
		}
		assert.ok(sum > 0);
		console.log('OCTANE_HOOK_TIMING=' + JSON.stringify(result));
	} finally {
		await window.happyDOM.close();
	}
}
