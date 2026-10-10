import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { build, parseAst, type Rolldown } from 'vite';
import { octane } from 'octane/compiler/vite';
import {
	resolveDeclarationRanges,
	retainedDeclarations,
} from '../../../benchmarks/bundle-size/hydration-free-gates.mjs';
import { evaluateCompiledFixtureCode } from './_server-fixture.js';

// Optional capabilities install a module-level driver or stage when an
// application first uses them. Vite's default production build drops what those
// variables guard from an application that never uses the capability, but only
// while the runtime reads each one in a form its minifier can fold (see the
// driver declarations in runtime.ts). The oracle is the bundle's source map: a
// declaration is retained exactly when some generated code maps into it.
const SOURCE = resolve(import.meta.dirname, '../src');
const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
const OPTIONAL_DECLARATIONS = [
	// ViewTransition's staged DOM and the drivers that prepare a staged commit.
	'STAGED_DOM',
	'VIEW_TRANSITION_DRIVER',
	'DEFERRED_LAYOUT_DRIVER',
	'STAGED_COMMIT_CAPTURE',
	// Suspense and Activity visibility, and effect reconnection on reveal.
	'SCHEDULED_VISIBILITY_DRIVER',
	'activityRefState',
	'EFFECT_RECONNECT_CONTEXT',
	// Signals read natively by compiled components, and a renderer path behind it.
	'NATIVE_READ_DRIVER',
	'beginActiveNativeReadScope',
];
const TRANSITION_HOOK_DECLARATIONS = [
	'stagedTransitionValue',
	'stageTransitionValue',
	'readQueuedTransition',
	'captureTransitionHookQueue',
	'recordUrgentActionUpdate',
	'finishQueuedTransition',
];
const ranges = resolveDeclarationRanges(
	(source: string) => readFileSync(join(SOURCE, source), 'utf8'),
	(text: string, source: string) => parseAst(text, { lang: 'ts' }, source),
	[...OPTIONAL_DECLARATIONS, ...TRANSITION_HOOK_DECLARATIONS].map((name) => ({
		name,
		source: 'runtime.ts',
	})),
);

const PLAIN_APP = `import { createRoot, flushSync, useState } from 'octane';

function Row(props) @{
	<li ref={props.onRef}>{props.label as string}</li>
}

function List(props) @{
	const [items, setItems] = useState(props.items);
	<div>
		<button onClick={() => setItems([...items].reverse())}>{'reverse'}</button>
		<ul>@for (const item of items; key item) { <Row label={item} onRef={props.onRef} /> }</ul>
	</div>
}

export function run(container) {
	const refs = [];
	const root = createRoot(container);
	const onRef = (el) => {
		if (el !== null) refs.push(el.textContent);
	};
	flushSync(() => root.render(List, { items: ['a', 'b', 'c'], onRef }));
	const before = container.textContent;
	flushSync(() => container.querySelector('button').click());
	const after = container.textContent;
	root.unmount();
	return { before, after, refs, empty: container.childNodes.length === 0 };
}
`;

const CAPABILITIES_APP = `import { Activity, Suspense, ViewTransition, createRoot, flushSync } from 'octane';
import { signal$ } from 'octane/signals';

const count$ = signal$(0);

function Counter() @{
	<button onClick={() => count$.set(count$.get() + 1)}>{String(count$.get()) as string}</button>
}

function App() @{
	<ViewTransition>
		<Suspense fallback={<p>{'loading'}</p>}>
			<Activity mode="visible"><Counter /></Activity>
		</Suspense>
	</ViewTransition>
}

export function run(container) {
	const root = createRoot(container);
	flushSync(() => root.render(App));
	const before = container.textContent;
	flushSync(() => container.querySelector('button').click());
	const after = container.textContent;
	root.unmount();
	return { before, after, empty: container.childNodes.length === 0 };
}
`;

const LATE_CUSTOM_HOOK_APP = `import { createRoot, flushSync, useState } from 'octane';

function useCounter(initial) {
	const [value, setValue] = useState(initial);
	return { value, increment: () => setValue(value + 1) };
}

function useNestedCounter(initial, fail) {
	const counter = useCounter(initial);
	if (fail) throw new Error('caught');
	return counter;
}

function App(props) @{
	const [direct, setDirect] = useState(0);
	let left, right, failure = '';
	if (props.show) {
		try { left = useNestedCounter(10, props.fail); }
		catch (error) { failure = error.message; }
		right = useNestedCounter(20, false);
	}
	<div>
		<button id="direct" onClick={() => setDirect(direct + 1)}>{String(direct)}</button>
		<output>{failure as string}</output>
		@if (left) { <button id="left" onClick={left.increment}>{String(left.value)}</button> }
		@if (right) { <button id="right" onClick={right.increment}>{String(right.value)}</button> }
	</div>
}

export function run(container) {
	const root = createRoot(container);
	const snapshots = [];
	const snapshot = () => snapshots.push(Array.from(container.querySelectorAll('button, output'), el => el.textContent));
	try {
		flushSync(() => root.render(App, { show: false }));
		flushSync(() => container.querySelector('#direct').click());
		snapshot();
		flushSync(() => root.render(App, { show: true, fail: true }));
		snapshot();
		flushSync(() => container.querySelector('#right').click());
		flushSync(() => root.render(App, { show: true, fail: false }));
		snapshot();
		flushSync(() => container.querySelector('#left').click());
		snapshot();
		flushSync(() => root.render(App, { show: false }));
		snapshot();
		flushSync(() => root.render(App, { show: true, fail: false }));
		snapshot();
	} finally {
		root.unmount();
	}
	return { snapshots, empty: container.childNodes.length === 0 };
}
`;

const LATE_EFFECT_APP = `import { createRoot, flushSync, useEffect, useInsertionEffect, useLayoutEffect } from 'octane';

function Effects(props) @{
	if (props.enabled) {
		useInsertionEffect(() => {
			props.record('insertion+');
			return () => props.record('insertion-');
		}, []);
		useLayoutEffect(() => {
			props.record('layout+');
			props.connected.push(props.container.querySelector('[data-effect]')?.isConnected ?? false);
			return () => props.record('layout-');
		}, []);
		useEffect(() => {
			props.record('passive+');
			return () => props.record('passive-');
		}, []);
	}
	if (props.fail) throw new Error('aborted');
	<p data-effect="">{String(props.enabled)}</p>
}

function Trigger(props) @{
	<span ref={node => { if (node !== null) props.open(); }}>trigger</span>
}

export async function run(container, scenario) {
	const events = [], snapshots = [], connected = [], errors = [];
	const record = event => events.push(event);
	const root = createRoot(container);
	const other = document.createElement('div');
	document.body.append(other);
	let childRoot;
	const show = (enabled, fail = false) => flushSync(() => root.render(Effects, {
		enabled, fail, record, connected, container,
	}));
	const waitFor = async (event, count) => {
		const deadline = Date.now() + 2000;
		while (events.filter(value => value === event).length < count) {
			if (Date.now() >= deadline) throw new Error('Missing scheduled ' + event);
			await new Promise(resolve => setTimeout(resolve, 5));
		}
	};
	try {
		if (scenario === 'conditional') {
			show(false);
			snapshots.push(events.slice());
			show(true);
			snapshots.push(events.slice());
			await waitFor('passive+', 1);
			show(false);
			snapshots.push(events.slice());
			await waitFor('passive-', 1);
			show(true);
			await waitFor('passive+', 2);
		} else if (scenario === 'reentrant') {
			root.render(Trigger, { open() {
				childRoot = createRoot(other);
				childRoot.render(Effects, { enabled: true, record, connected, container: other });
			} });
			await waitFor('passive+', 1);
		} else {
			try { show(true, true); } catch (error) { errors.push(error.message); }
			snapshots.push(events.slice());
			show(true);
			await waitFor('passive+', 1);
		}
		root.unmount();
		childRoot?.unmount();
		await waitFor('passive-', scenario === 'conditional' ? 2 : 1);
		return { events, snapshots, connected, errors, empty: container.childNodes.length === 0 && other.childNodes.length === 0 };
	} finally {
		root.unmount();
		childRoot?.unmount();
		other.remove();
	}
}
`;

const UPDATER_TRANSITION_APP = `import { createRoot, flushSync, startTransition, useLinkedState, useState } from 'octane';

function View(props) @{
	const [value, update, read] = props.linked
		? useLinkedState(0, (source) => source)
		: useState(0);
	props.bind(update, read);
	<output>{String(value)}</output>
}

export async function run(container, kind) {
	let update, read, release, started = false;
	const gate = new Promise(resolve => { release = resolve; });
	const root = createRoot(container);
	try {
		root.render(View, { linked: kind === 'linked', bind: (setter, getter) => { update = setter; read = getter; } });
		const before = container.textContent;
		update(previous => {
			if (!started) {
				started = true;
				startTransition(async () => { await gate; });
			}
			return previous + 1;
		});
		flushSync(() => {});
		const pending = { text: container.textContent, value: read() };
		release();
		for (let tick = 0; tick < 20 && container.textContent !== '1'; tick++) {
			await new Promise(resolve => setTimeout(resolve, 0));
			flushSync(() => {});
		}
		const settled = { text: container.textContent, value: read() };
		root.unmount();
		return { before, pending, settled, empty: container.childNodes.length === 0 };
	} finally {
		release();
		root.unmount();
	}
}
`;

const roots: string[] = [];
afterAll(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// An ordinary production build of the application: Vite's default minifier,
// with the runtime bundled from source the way a consumer compiles it.
async function buildApp(source: string) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-optional-drivers-')));
	roots.push(root);
	mkdirSync(join(root, 'node_modules'));
	symlinkSync(PACKAGE_ROOT, join(root, 'node_modules/octane'), 'dir');
	writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
	writeFileSync(join(root, 'App.tsrx'), source);
	const result = await build({
		root,
		configFile: false,
		logLevel: 'silent',
		mode: 'production',
		plugins: [octane({ hmr: false })],
		define: {
			__OCTANE_PROFILE_ENABLED__: 'false',
			'process.env.NODE_ENV': JSON.stringify('production'),
		},
		build: {
			write: false,
			sourcemap: true,
			target: 'esnext',
			lib: { entry: join(root, 'App.tsrx'), formats: ['es'] },
		},
	});
	const output = (Array.isArray(result) ? result : [result]).flatMap((item) => {
		if (!('output' in item)) throw new Error('Expected a one-shot Vite build.');
		return item.output;
	});
	const chunks = output.filter((item): item is Rolldown.OutputChunk => item.type === 'chunk');
	expect(chunks).toHaveLength(1);
	const [chunk] = chunks;
	if (chunk.map === null) throw new Error('Expected a source map.');
	return { retained: retainedDeclarations(chunk.map, ranges), chunk };
}

// The bundle carries its own runtime, so it imports nothing from the test's.
async function run(chunk: Rolldown.OutputChunk, scenario?: string) {
	const app = evaluateCompiledFixtureCode(chunk.code, chunk.fileName, 'client', undefined);
	const container = document.createElement('div');
	document.body.append(container);
	try {
		return await app.run(container, scenario);
	} finally {
		container.remove();
	}
}

describe('optional capability drivers in production bundles', { timeout: 60_000 }, () => {
	it('ships none of their code in an application that uses none of them', async () => {
		const { retained, chunk } = await buildApp(PLAIN_APP);
		expect(
			[...OPTIONAL_DECLARATIONS, ...TRANSITION_HOOK_DECLARATIONS].filter((name) =>
				retained.has(name),
			),
		).toEqual([]);
		expect(await run(chunk)).toEqual({
			before: 'reverseabc',
			after: 'reversecba',
			refs: ['a', 'b', 'c'],
			empty: true,
		});
	});

	it.each(['state', 'linked'])(
		'holds the first async transition opened by a %s updater until it settles',
		async (kind) => {
			const { retained, chunk } = await buildApp(UPDATER_TRANSITION_APP);
			expect(await run(chunk, kind)).toEqual({
				before: '0',
				pending: { text: '0', value: 1 },
				settled: { text: '1', value: 1 },
				empty: true,
			});
			expect(TRANSITION_HOOK_DECLARATIONS.filter((name) => !retained.has(name))).toEqual([]);
		},
	);

	it('keeps each driver in an application that uses its capability', async () => {
		const { retained, chunk } = await buildApp(CAPABILITIES_APP);
		expect(OPTIONAL_DECLARATIONS.filter((name) => !retained.has(name))).toEqual([]);
		expect(await run(chunk)).toEqual({ before: '0', after: '1', empty: true });
	});

	it('preserves direct and nested state when custom hooks first run during a later render', async () => {
		const { chunk } = await buildApp(LATE_CUSTOM_HOOK_APP);
		expect(await run(chunk)).toEqual({
			snapshots: [
				['1', ''],
				['1', 'caught', '20'],
				['1', '', '10', '21'],
				['1', '', '11', '21'],
				['1', ''],
				['1', '', '11', '21'],
			],
			empty: true,
		});
	});

	const cycle = ['insertion+', 'layout+', 'passive+', 'insertion-', 'layout-', 'passive-'];
	it.each([
		{
			scenario: 'conditional',
			events: [...cycle, ...cycle],
			snapshots: [[], cycle.slice(0, 2), cycle.slice(0, 5)],
			connected: [true, true],
			errors: [],
		},
		{ scenario: 'reentrant', events: cycle, snapshots: [], connected: [true], errors: [] },
		{ scenario: 'aborted', events: cycle, snapshots: [[]], connected: [true], errors: ['aborted'] },
	])(
		'preserves the first $scenario effect lifecycle and its cleanup',
		async ({ scenario, ...expected }) => {
			const { chunk } = await buildApp(LATE_EFFECT_APP);
			expect(await run(chunk, scenario)).toEqual({ ...expected, empty: true });
		},
	);
});
