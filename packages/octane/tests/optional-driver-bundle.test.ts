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
const FORM_COMMIT_DECLARATIONS = [
	'drainQueuedControlledSyncs',
	'publishRegisteredManualFormPending',
];
const ranges = resolveDeclarationRanges(
	(source: string) => readFileSync(join(SOURCE, source), 'utf8'),
	(text: string, source: string) => parseAst(text, { lang: 'ts' }, source),
	[...OPTIONAL_DECLARATIONS, ...FORM_COMMIT_DECLARATIONS].map((name) => ({
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

const LATE_FORM_COMMIT_APP = `import { createRoot, flushSync } from 'octane';

function Idle() @{ <p>idle</p> }

function Fields(props) @{
	<form>
		<select id="controlled" value={props.value} onChange={() => {}}>
			@for (const value of props.options; key value) { <option value={value}>{value as string}</option> }
		</select>
		<select id="defaulted" defaultValue={props.defaultValue}>
			@for (const value of props.options; key value) { <option value={value}>{value as string}</option> }
		</select>
		<input id="focused" autoFocus />
	</form>
}

function Launcher(props) @{ <div ref={props.onReady} /> }

export function run(container) {
	const target = document.createElement('div');
	document.body.append(target);
	const root = createRoot(container);
	const owner = createRoot(target);
	try {
		flushSync(() => owner.render(Idle));
		const before = target.textContent;
		flushSync(() => root.render(Launcher, { onReady: (node) => {
			if (node !== null) owner.render(Fields, { value: 'b', defaultValue: 'b', options: ['a', 'b'] });
		} }));
		const controlled = target.querySelector('#controlled');
		const defaulted = target.querySelector('#defaulted');
		const mounted = [controlled.value, defaulted.value, document.activeElement.id];
		const defaults = Array.from(defaulted.options, option => option.defaultSelected);
		defaulted.value = 'a';
		target.querySelector('form').reset();
		const reset = defaulted.value;
		flushSync(() => owner.render(Fields, { value: 'c', defaultValue: 'a', options: ['b', 'c'] }));
		return { before, mounted, defaults, reset, updated: controlled.value, sameSelect: target.querySelector('#controlled') === controlled };
	} finally {
		owner.unmount();
		root.unmount();
		target.remove();
	}
}
`;

const LATE_MANUAL_FORM_APP = `import { createRoot, flushSync, startTransition, useFormStatus, useTransition } from 'octane';

function Idle() @{ <p>idle</p> }

function Status() @{
	const status = useFormStatus();
	<output>{status.pending ? 'pending:' + status.method + ':' + status.data?.get('draft') : 'idle'}</output>
}

function Form(props) @{
	const [pending, start] = useTransition();
	<form method="post" onSubmit={event => { event.preventDefault(); props.begin(start); }}>
		<input name="draft" defaultValue="kept" />
		<Status />
		<span>{pending ? 'working' : 'ready'}</span>
	</form>
}

export async function run(container) {
	let releaseFirst, releaseSecond;
	const first = new Promise(resolve => { releaseFirst = resolve; });
	const second = new Promise(resolve => { releaseSecond = resolve; });
	const settle = async () => {
		for (let i = 0; i < 30; i++) await Promise.resolve();
		flushSync(() => {});
	};
	const root = createRoot(container);
	try {
		flushSync(() => root.render(Idle));
		const before = container.textContent;
		flushSync(() => root.render(Form, { begin(start) {
			start(() => first);
			startTransition(() => second);
		} }));
		const snapshots = [];
		const snapshot = () => snapshots.push(container.textContent);
		snapshot();
		flushSync(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
		await settle();
		snapshot();
		releaseFirst();
		await settle();
		snapshot();
		releaseSecond();
		await settle();
		snapshot();
		return { before, snapshots };
	} finally {
		releaseFirst();
		releaseSecond();
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
async function run(chunk: Rolldown.OutputChunk) {
	const app = evaluateCompiledFixtureCode(chunk.code, chunk.fileName, 'client', undefined);
	const container = document.createElement('div');
	document.body.append(container);
	try {
		return await app.run(container);
	} finally {
		container.remove();
	}
}

describe('optional capability drivers in production bundles', { timeout: 60_000 }, () => {
	it('ships none of their code in an application that uses none of them', async () => {
		const { retained, chunk } = await buildApp(PLAIN_APP);
		expect(
			[...OPTIONAL_DECLARATIONS, ...FORM_COMMIT_DECLARATIONS].filter((name) => retained.has(name)),
		).toEqual([]);
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

	it('commits the first late select defaults and autofocus opened from another root’s ref', async () => {
		const { retained, chunk } = await buildApp(LATE_FORM_COMMIT_APP);
		expect(await run(chunk)).toEqual({
			before: 'idle',
			mounted: ['b', 'b', 'focused'],
			defaults: [false, true],
			reset: 'b',
			updated: 'c',
			sameSelect: true,
		});
		expect(retained.has('drainQueuedControlledSyncs')).toBe(true);
	});

	it('keeps a late manual submit pending until its public and hook transitions settle', async () => {
		const { retained, chunk } = await buildApp(LATE_MANUAL_FORM_APP);
		expect(await run(chunk)).toEqual({
			before: 'idle',
			snapshots: ['idleready', 'pending:post:keptworking', 'pending:post:keptworking', 'idleready'],
		});
		expect(retained.has('publishRegisteredManualFormPending')).toBe(true);
	});
});
