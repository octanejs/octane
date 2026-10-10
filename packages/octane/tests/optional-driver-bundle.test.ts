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
const REF_DECLARATIONS = [
	'drainQueuedRefAttaches',
	'drainQueuedRefDetaches',
	'detachRegisteredSubtreeRefs',
	'withRegisteredRefDetachSuppression',
];
const ranges = resolveDeclarationRanges(
	(source: string) => readFileSync(join(SOURCE, source), 'utf8'),
	(text: string, source: string) => parseAst(text, { lang: 'ts' }, source),
	[...OPTIONAL_DECLARATIONS, ...REF_DECLARATIONS].map((name) => ({ name, source: 'runtime.ts' })),
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

const NO_REFS_APP = `import { createRoot, flushSync, useState } from 'octane';
function App() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{String(count)}</button>
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

const LATE_REFS_APP = `import { createRoot, flushSync, useLayoutEffect } from 'octane';
function App(props) @{
	useLayoutEffect(() => { props.layout(props.objectRef.current?.textContent ?? null); }, [props.show]);
	@if (props.show) { <div ref={props.refs}>ref</div> }
	@else { <p>plain</p> }
}
export function run(container) {
	const root = createRoot(container), objectRef = { current: null };
	const calls = [], layouts = [], snapshots = [];
	const callback = node => {
		if (node === null) { calls.push('null'); return; }
		calls.push('attach:' + node.isConnected);
		return () => calls.push('cleanup');
	};
	const refs = [objectRef, callback], layout = value => layouts.push(value);
	const render = show => flushSync(() => root.render(App, { show, refs, objectRef, layout }));
	render(false);
	snapshots.push(container.textContent);
	render(true);
	snapshots.push(objectRef.current === container.querySelector('div'));
	render(false);
	snapshots.push(objectRef.current === null);
	render(true);
	snapshots.push(objectRef.current === container.querySelector('div'));
	root.unmount();
	return { snapshots, calls, layouts, cleared: objectRef.current === null, empty: container.childNodes.length === 0 };
}
`;

const LATE_SPREAD_REFS_APP = `import { createRoot, flushSync, use } from 'octane';
function Wait(props) @{
	if (props.pending !== null) use(props.pending);
	<span>ready</span>
}
function App(props) @{
	@try {
		<><div {...props.attrs}>target</div><Wait pending={props.pending} /></>
	} @pending {
		<p id="pending-ref">loading</p>
	}
}
export async function run(container, scenario) {
	let release;
	const emptyAttrs = { id: 'spread-ref' };
	const gate = new Promise(resolve => { release = resolve; });
	const root = createRoot(container), calls = [];
	let cleanups = 0;
	flushSync(() => root.render(App, { attrs: emptyAttrs, pending: null }));
	const node = container.querySelector('#spread-ref');
	const ref = value => {
		calls.push(value === null ? 'null' : value === node ? 'attach' : 'wrong-node');
		if (value !== null) return () => { cleanups++; };
	};
	const attrs = { ...emptyAttrs, ref };
	flushSync(() => root.render(App, { attrs, pending: null }));
	const committed = calls.slice();
	flushSync(() => root.render(App, { attrs, pending: gate }));
	const pending = container.querySelector('#pending-ref')?.textContent;
	const callsAtHide = calls.slice();
	const cleanupsAtHide = cleanups;
	let retained = false, revealed = false;
	if (scenario !== 'discard') {
		release();
		await gate;
		flushSync(() => root.render(App, { attrs, pending: null }));
		retained = container.querySelector('#spread-ref') === node;
		revealed = container.querySelector('#pending-ref') === null && node.style.display !== 'none';
	}
	root.unmount();
	return { committed, pending, callsAtHide, cleanupsAtHide, calls, cleanups, retained, revealed, empty: container.childNodes.length === 0 };
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
	it('omits ref consumers when no ref queue or potential spread can use them', async () => {
		const { retained, chunk } = await buildApp(NO_REFS_APP);
		expect(await run(chunk)).toEqual({ before: '0', after: '1', empty: true });
		expect(REF_DECLARATIONS.filter((name) => retained.has(name))).toEqual([]);
	});

	it('activates late ref attachments and releases every mounted ref at commit', async () => {
		const { retained, chunk } = await buildApp(LATE_REFS_APP);
		expect(await run(chunk)).toEqual({
			snapshots: ['plain', true, true, true],
			calls: ['attach:true', 'cleanup', 'attach:true', 'cleanup'],
			layouts: [null, 'ref', null, 'ref'],
			cleared: true,
			empty: true,
		});
		expect(REF_DECLARATIONS.filter((name) => !retained.has(name))).toEqual([]);
	});

	it.each(['reveal', 'discard'])(
		'keeps a late spread ref live through Suspense %s',
		async (scenario) => {
			const { retained, chunk } = await buildApp(LATE_SPREAD_REFS_APP);
			const result = await run(chunk, scenario);
			expect(result.committed).toEqual(['attach']);
			expect(result.callsAtHide).toEqual(['attach']);
			expect(result.cleanupsAtHide).toBe(1);
			expect(result.pending).toBe('loading');
			expect(result.empty).toBe(true);
			if (scenario === 'reveal') {
				expect(result.retained).toBe(true);
				expect(result.revealed).toBe(true);
				expect(result.calls).toEqual(['attach', 'attach']);
				expect(result.cleanups).toBe(2);
			} else {
				expect(result.calls).toEqual(result.callsAtHide);
				expect(result.cleanups).toBe(1);
			}
			expect(retained.has('detachRegisteredSubtreeRefs')).toBe(true);
			expect(retained.has('withRegisteredRefDetachSuppression')).toBe(true);
		},
	);

	it('ships none of their code in an application that uses none of them', async () => {
		const { retained, chunk } = await buildApp(PLAIN_APP);
		expect(OPTIONAL_DECLARATIONS.filter((name) => retained.has(name))).toEqual([]);
		expect(await run(chunk)).toEqual({
			before: 'reverseabc',
			after: 'reversecba',
			refs: ['a', 'b', 'c'],
			empty: true,
		});
	});

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
