import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectRecords } from './diagnostics.mjs';

// Untimed structural diagnostic. Capture actual runtime records without adding
// fields to them, then compare V8 maps and heap-snapshot shallow sizes. The
// property-array size is included separately; closures and retained scope/DOM
// graphs are deliberately not attributed to an individual hook record.
const args = process.argv.slice(2);
const child = args[0] === '--probe';
if (child) args.shift();
const bundle = args[0];
if (!bundle)
	throw new Error('Usage: node hooks.mjs <runtime.mjs> [--observe] [--output <report.json>]');
if (!child) {
	const result = spawnSync(
		process.execPath,
		[
			'--expose-gc',
			'--allow-natives-syntax',
			fileURLToPath(import.meta.url),
			'--probe',
			resolve(bundle),
			...(args.includes('--observe') ? ['--observe'] : []),
		],
		{ encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
	);
	if (result.status !== 0) {
		process.stderr.write(result.stderr);
		process.stderr.write(result.stdout);
		throw new Error(`Hook structural probe exited with status ${result.status}`);
	}
	const marker = 'OCTANE_HOOK_SHAPES=';
	const line = result.stdout.split('\n').find((value) => value.startsWith(marker));
	if (!line) throw new Error('Hook structural probe did not return its report');
	const report = JSON.parse(line.slice(marker.length));
	const json = JSON.stringify(report, null, 2) + '\n';
	const output = args.indexOf('--output');
	if (output !== -1) await writeFile(resolve(args[output + 1]), json);
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
	]) {
		globalThis[name] = name === 'window' ? window : window[name];
	}
	const runtime = await import(pathToFileURL(resolve(bundle)).href);
	const stateSlot = Symbol('benchmark state');
	const reducerSlot = Symbol('benchmark reducer');
	const memoSlot = Symbol('benchmark memo');
	const records = {};
	const mounted = [];
	const nativeSet = Map.prototype.set;
	const reducer = (value, amount) => value + amount;
	function capture(run, cells) {
		Map.prototype.set = function (key, value) {
			if (key === stateSlot && typeof value?.setter === 'function') cells.state = value;
			if (key === reducerSlot && typeof value?.dispatch === 'function') cells.reducer = value;
			if (key === memoSlot && value !== null && !Array.isArray(value) && 'deps' in value)
				cells.memo = value;
			return nativeSet.call(this, key, value);
		};
		try {
			return run();
		} finally {
			Map.prototype.set = nativeSet;
		}
	}
	function Hooks(props) {
		const state = props.getters
			? runtime.__useStateWithGetter(0, stateSlot)
			: runtime.useState(0, stateSlot);
		const total = props.getters
			? runtime.__useReducerWithGetter(reducer, 0, undefined, reducerSlot)
			: runtime.useReducer(reducer, 0, undefined, reducerSlot);
		if (props.warm) runtime.registerWarmPlan(() => {}, props);
		const create = () => ({ sum: state[0] + total[0] });
		const memo = props.native
			? runtime.nativePuMemo(create, [state[0], total[0]], memoSlot)
			: runtime.useMemo(create, [state[0], total[0]], memoSlot);
		props.bind({ state, total, memo });
		return runtime.createElement('output', null, String(memo.sum));
	}
	function mount(options = {}) {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = runtime.createRoot(container);
		const cells = {};
		let controls;
		const props = {
			...options,
			bind: (value) => {
				controls = value;
			},
		};
		capture(() => runtime.flushSync(() => root.render(Hooks, props)), cells);
		assert.equal(container.textContent, '0');
		const value = {
			root,
			container,
			cells,
			props,
			get controls() {
				return controls;
			},
		};
		mounted.push(value);
		return value;
	}
	try {
		// Let constructor slack tracking settle before measuring any actual cells.
		for (let index = 0; index < 16; index++) {
			const warmup = mount();
			warmup.root.unmount();
			warmup.container.remove();
			mounted.pop();
		}
		const idle = mount();
		records.stateIdle = idle.cells.state;
		records.reducerIdle = idle.cells.reducer;
		records.memoOrdinary = idle.cells.memo;
		const getters = mount({ getters: true });
		records.stateGetter = getters.cells.state;
		records.reducerGetter = getters.cells.reducer;
		assert.equal(getters.controls.state[2](), 0);
		assert.equal(getters.controls.total[2](), 0);
		const queued = mount();
		runtime.flushSync(() => {
			queued.controls.state[1]((value) => value + 1);
			queued.controls.state[1]((value) => value + 2);
			queued.controls.total[1](4);
		});
		assert.equal(queued.container.textContent, '7');
		records.stateAfterQueue = queued.cells.state;
		records.reducerAfterQueue = queued.cells.reducer;
		const transition = mount({ getters: true });
		runtime.startTransition(() => {
			transition.controls.state[1](2);
			transition.controls.total[1](3);
		});
		runtime.flushSync(() => {});
		assert.equal(transition.container.textContent, '5');
		assert.equal(transition.controls.state[2](), 2);
		assert.equal(transition.controls.total[2](), 3);
		records.stateAfterTransition = transition.cells.state;
		records.reducerAfterTransition = transition.cells.reducer;
		if (transition.cells.state.transition !== undefined)
			records.coldStateTransition = transition.cells.state.transition;
		if (transition.cells.reducer.transition !== undefined)
			records.coldReducerTransition = transition.cells.reducer.transition;
		const warm = mount({ warm: true });
		records.memoWarmRecorded = warm.cells.memo;
		const native = mount({ native: true });
		records.memoNative = native.cells.memo;
		for (const [name, cell] of Object.entries(records))
			assert.ok(cell, `Missing hook record ${name}`);
		const families = {
			state: Object.keys(records).filter((name) => name.startsWith('state')),
			reducer: Object.keys(records).filter((name) => name.startsWith('reducer')),
			memo: Object.keys(records).filter((name) => name.startsWith('memo')),
		};
		const coldNames = Object.keys(records).filter((name) => name.startsWith('cold'));
		if (coldNames.length !== 0) families.cold = coldNames;
		const inspection = await inspectRecords(records, families);
		if (!args.includes('--observe')) {
			for (const [family, maps] of Object.entries(inspection.maps))
				assert.equal(maps.length, 1, `${family} hook records should share one map`);
		}
		console.log(
			'OCTANE_HOOK_SHAPES=' +
				JSON.stringify({
					node: process.version,
					v8: process.versions.v8,
					runtime: resolve(bundle),
					metric:
						'Untimed V8 maps and heap-snapshot shallow record/property-array bytes; excludes retained closures, scopes, and DOM.',
					controls: {
						queuedText: queued.container.textContent,
						transitionText: transition.container.textContent,
						getters: [transition.controls.state[2](), transition.controls.total[2]()],
					},
					...inspection,
				}),
		);
	} finally {
		Map.prototype.set = nativeSet;
		for (const { root, container } of mounted) {
			root.unmount();
			container.remove();
		}
		await window.happyDOM.close();
	}
}
