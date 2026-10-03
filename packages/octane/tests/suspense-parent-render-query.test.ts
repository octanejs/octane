import { describe, expect, it } from 'vitest';
import * as signals from 'octane/signals';
import { act, createRoot } from 'octane';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// A parent render while a Suspense boundary's first attempt is pending restarts
// that attempt's hooks, but not its query$ requests: the replacement attempt
// re-selects each query from its own inputs and shares an equal request.

// The octane project covers the dev compile; octane-prod covers prod.
const dev = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';

const FIELDS = {
	query: `import { query$ } from 'octane/signals';
export function Field(props) {
	const value$ = query$(() => props.id, props.load);
	return <output>{String(value$.get())}</output>;
}`,
	// The first declaration's initial value wins, so new inputs restart the cell.
	signal: `import { query$, signal$ } from 'octane/signals';
export function Field(props) {
	const label$ = signal$(props.label);
	const value$ = query$(() => props.id, props.load);
	return <output>{label$.get() + ':' + String(value$.get())}</output>;
}`,
	// Captured render values never restart asynchronous derived$ work.
	derived: `import { derived$ } from 'octane/signals';
export function Field(props) {
	const value$ = derived$(() => props.load(props.id));
	return <output>{String(value$.get())}</output>;
}`,
};

const APPS = {
	tsx: {
		id: '/src/app.tsx',
		source: `import { Suspense, useState } from 'octane';
import { Field } from './field';
function Mid(props) {
	return <div data-note={props.note}><Field id={props.id} label={props.label} load={props.load}/></div>;
}
export function App(props) {
	const [id, setId] = useState('a');
	const [label, setLabel] = useState('x');
	const [note, setNote] = useState(0);
	const [tick, setTick] = useState(0);
	props.controls.setId = setId;
	props.controls.setLabel = setLabel;
	props.controls.setNote = setNote;
	props.controls.setTick = setTick;
	return <main data-tick={tick}><Suspense fallback={<i>waiting</i>}><Mid id={id} label={label} note={note} load={props.load}/></Suspense></main>;
}`,
	},
	tsrxJsx: {
		id: '/src/app-jsx.tsrx',
		source: `import { Suspense, useState } from 'octane';
import { Field } from './field';
function Mid(props) @{
	<div data-note={props.note}><Field id={props.id} label={props.label} load={props.load}/></div>
}
export function App(props) @{
	const [id, setId] = useState('a');
	const [label, setLabel] = useState('x');
	const [note, setNote] = useState(0);
	const [tick, setTick] = useState(0);
	props.controls.setId = setId;
	props.controls.setLabel = setLabel;
	props.controls.setNote = setNote;
	props.controls.setTick = setTick;
	<main data-tick={tick}><Suspense fallback={<i>waiting</i>}><Mid id={id} label={label} note={note} load={props.load}/></Suspense></main>
}`,
	},
	tsrx: {
		id: '/src/app.tsrx',
		source: `import { useState } from 'octane';
import { Field } from './field';
function Mid(props) @{
	<div data-note={props.note}><Field id={props.id} label={props.label} load={props.load}/></div>
}
export function App(props) @{
	const [id, setId] = useState('a');
	const [label, setLabel] = useState('x');
	const [note, setNote] = useState(0);
	const [tick, setTick] = useState(0);
	props.controls.setId = setId;
	props.controls.setLabel = setLabel;
	props.controls.setNote = setNote;
	props.controls.setTick = setTick;
	<main data-tick={tick}>
		@try {
			<Mid id={id} label={label} note={note} load={props.load}/>
		} @pending {
			<i>{'waiting'}</i>
		}
	</main>
}`,
	},
};

type AppName = keyof typeof APPS;
type FieldName = keyof typeof FIELDS;

// Compile at collection: a cold compile under load must not spend a test's timeout.
const compiled = new Map<string, any>();
function compileApp(app: AppName, field: FieldName): any {
	const key = `${app}:${field}`;
	let module = compiled.get(key);
	if (module === undefined) {
		const compileOptions = { dev, hmr: false };
		const runtimeModules = { 'octane/signals': signals };
		const fieldModule = loadCompiledFixtureSource(FIELDS[field], {
			id: `/src/field-${field}.tsx`,
			mode: 'client',
			compileOptions,
			runtimeModules,
		});
		module = loadCompiledFixtureSource(APPS[app].source, {
			id: APPS[app].id,
			mode: 'client',
			compileOptions,
			runtimeModules: { ...runtimeModules, './field': fieldModule },
		});
		compiled.set(key, module);
	}
	return module;
}

interface Call {
	id: string;
	signal: AbortSignal;
	resolve(value: string): void;
}

interface Controls {
	setId(id: string): void;
	setLabel(label: string): void;
	setNote(update: (note: number) => number): void;
	setTick(update: (tick: number) => number): void;
}

async function scenario(
	app: AppName,
	field: FieldName,
	run: (harness: {
		calls: Call[];
		ids: () => string[];
		shown: () => string;
		update: (write: (controls: Controls) => void) => Promise<void>;
		settle: (call: Call | undefined, value: string) => Promise<void>;
		unmount: () => void;
	}) => Promise<void>,
): Promise<void> {
	const { App } = compileApp(app, field);
	const calls: Call[] = [];
	// Derived computations call the loader directly, without a query context.
	const load = (id: string, context?: { signal: AbortSignal }) =>
		new Promise<string>((resolve) =>
			calls.push({ id, signal: context?.signal ?? new AbortController().signal, resolve }),
		);
	const controls = {} as Controls;
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	let mounted = true;
	const unmount = () => {
		if (!mounted) return;
		mounted = false;
		root.unmount();
		container.remove();
	};
	try {
		await act(() => root.render(App, { load, controls }));
		await run({
			calls,
			ids: () => calls.map((call) => call.id),
			// A pending boundary keeps its completed primary hidden behind the fallback.
			shown: () =>
				container.querySelector('i') !== null
					? 'waiting'
					: (container.querySelector('output')?.textContent ?? ''),
			update: (write) => act(() => write(controls)),
			settle: (call, value) => act(() => call?.resolve(value)),
			unmount,
		});
	} finally {
		unmount();
	}
}

const tick = (controls: Controls) => controls.setTick((n) => n + 1);

describe.each(Object.keys(APPS) as AppName[])(
	'a pending boundary across parent renders (%s app)',
	(app) => {
		compileApp(app, 'query');

		it('keeps the pending query across parent renders with equal props', async () => {
			await scenario(app, 'query', async ({ ids, shown, update, settle, calls }) => {
				expect(ids()).toEqual(['a']);
				for (let i = 0; i < 3; i++) await update(tick);
				expect(ids()).toEqual(['a']);
				expect(shown()).toBe('waiting');
				await settle(calls[0], 'A');
				expect(shown()).toBe('A');
				expect(ids()).toEqual(['a']);
			});
		});

		it('keeps the pending query when the parent changes an unrelated input', async () => {
			await scenario(app, 'query', async ({ ids, shown, update, settle, calls }) => {
				// New inputs restart the uncommitted attempt, in compiled @try too.
				for (let i = 0; i < 3; i++) await update((controls) => controls.setNote((n) => n + 1));
				expect(ids()).toEqual(['a']);
				await settle(calls[0], 'A');
				expect(shown()).toBe('A');
				expect(ids()).toEqual(['a']);
			});
		});

		it('reveals when the parent re-renders before each load settles', async () => {
			await scenario(app, 'query', async ({ ids, shown, update, settle, calls }) => {
				// Each parent render used to restart the load, so the fallback never left.
				for (let i = 0; i < 3; i++) {
					await update(tick);
					await settle(calls[i], `v${i}`);
				}
				expect(shown()).toBe('v0');
				expect(ids()).toEqual(['a']);
			});
		});

		it('loads a changed selection once and aborts the superseded request', async () => {
			await scenario(app, 'query', async ({ ids, shown, update, settle, calls }) => {
				await update((controls) => controls.setId('b'));
				expect(calls[0]!.signal.aborted).toBe(true);
				await update(tick);
				expect(ids()).toEqual(['a', 'b']);
				expect(calls[1]!.signal.aborted).toBe(false);
				expect(shown()).toBe('waiting');
				await settle(calls[1], 'B');
				expect(shown()).toBe('B');
				expect(calls[1]!.signal.aborted).toBe(false);
				// The settled superseded load cannot publish over the revealed selection.
				await settle(calls[0], 'stale');
				expect(shown()).toBe('B');
			});
		});

		it('aborts the retained request when the pending boundary unmounts', async () => {
			await scenario(app, 'query', async ({ calls, update, unmount }) => {
				await update(tick);
				expect(calls.length).toBe(1);
				expect(calls[0]!.signal.aborted).toBe(false);
				unmount();
				expect(calls[0]!.signal.aborted).toBe(true);
			});
		});
	},
);

describe.each(['tsx', 'tsrx'] as const)(
	'state that cannot follow superseding inputs (%s app)',
	(app) => {
		compileApp(app, 'signal');
		compileApp(app, 'derived');

		it("re-initializes a component's signal$ from the new inputs", async () => {
			await scenario(app, 'signal', async ({ shown, update, settle, calls }) => {
				await update((controls) => controls.setLabel('y'));
				for (const call of [...calls]) await settle(call, call.id.toUpperCase());
				for (const call of [...calls]) await settle(call, call.id.toUpperCase());
				expect(shown()).toBe('y:A');
			});
		});

		it('restarts an asynchronous derived$ with the new inputs', async () => {
			await scenario(app, 'derived', async ({ shown, update, settle, calls }) => {
				await update((controls) => controls.setId('b'));
				for (const call of [...calls]) await settle(call, call.id.toUpperCase());
				for (const call of [...calls]) await settle(call, call.id.toUpperCase());
				expect(shown()).toBe('B');
			});
		});
	},
);
