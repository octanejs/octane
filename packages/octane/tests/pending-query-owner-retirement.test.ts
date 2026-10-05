import { expect, it } from 'vitest';
import { createRoot, flushSync, hydrateRoot, type Root } from 'octane';
import { prerender } from 'octane/static';
import * as signals from 'octane/signals';
import { act } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

type Dialect = 'tsx' | 'tsrx' | 'try';
type Request = { id: string; signal: AbortSignal; resolve(value: string): void };

function requests() {
	const pending: Request[] = [];
	const load = (id: string, { signal }: { signal: AbortSignal }) =>
		new Promise<string>((resolve) => pending.push({ id, signal, resolve }));
	return { pending, load };
}

function keyedApp(dialect: Dialect, mode: 'client' | 'server', dev: boolean) {
	const child = '<Field key={props.ownerKey} id={props.id} load={props.load}/>';
	const boundary =
		dialect === 'try'
			? `@try { ${child} } @pending { <i>waiting</i> }`
			: `<Suspense fallback={<i>waiting</i>}>${child}</Suspense>`;
	const source = `import { Suspense } from 'octane';
import { query$ } from 'octane/signals';
type Props = { id: string; load: (id: string, context: { signal: AbortSignal }) => Promise<string> };
function Field(props: Props) ${dialect === 'tsx' ? '{' : '@{'}
	const value$ = query$(() => props.id, props.load);
	${dialect === 'tsx' ? 'return <output>{String(value$.get())}</output>;' : '<output>{value$}</output>'}
}
export function App(props: Props & { ownerKey: string }) ${dialect === 'tsx' ? '{ return (' : '@{'}
	<main>${boundary}</main>
${dialect === 'tsx' ? '); }' : '}'}
`;
	return loadCompiledFixtureSource(source, {
		id: `/pending-query-owner.${dialect === 'tsx' ? 'tsx' : 'tsrx'}`,
		mode,
		compileOptions: { dev, hmr: false },
		runtimeModules: { 'octane/signals': signals },
	}).App;
}

const modes = (['tsx', 'tsrx', 'try'] as const).flatMap((dialect) =>
	[false, true].flatMap((hydrate) => [false, true].map((dev) => ({ dialect, hydrate, dev }))),
);

it.each(modes)(
	'retires a pending query when only its owner key changes ($dialect, hydrate=$hydrate, dev=$dev)',
	async ({ dialect, hydrate, dev }) => {
		const App = keyedApp(dialect, 'client', dev);
		const { pending, load } = requests();
		const props = { id: 'a', ownerKey: 'old', load };
		const container = document.createElement('div');
		document.body.append(container);
		let root: Root;
		if (hydrate) {
			const Server = keyedApp(dialect, 'server', dev);
			container.innerHTML = (
				await prerender(Server, { ...props, id: 'server', load: async () => 'server' })
			).html;
			root = hydrateRoot(container, App, props);
		} else {
			root = createRoot(container);
			root.render(App, props);
		}
		flushSync(() => {});
		const checkpoints: Record<string, unknown>[] = [];
		const record = (stage: string) =>
			checkpoints.push({
				stage,
				requests: pending.map(({ id, signal }) => ({ id, aborted: signal.aborted })),
				text:
					container.querySelector('output')?.textContent ??
					container.querySelector('i')?.textContent ??
					'',
			});
		try {
			expect(pending.map(({ id }) => id)).toEqual(['a']);
			const first = pending[0]!;
			flushSync(() => root.render(App, { ...props, ownerKey: 'new' }));
			record('after key change');
			expect.soft(first.signal.aborted).toBe(true);
			expect.soft(pending.map(({ id }) => id)).toEqual(['a', 'a']);
			await act(() => first.resolve('obsolete'));
			record('after old request resolves');
			expect.soft(container.textContent).not.toContain('obsolete');
			if (pending[1]) await act(() => pending[1]!.resolve('replacement'));
			record('after replacement resolves');
			expect.soft(container.querySelector('output')?.textContent).toBe('replacement');
		} finally {
			root.unmount();
			record('after unmount');
			console.log(JSON.stringify({ case: 'key change', dialect, hydrate, dev, checkpoints }));
			container.remove();
		}
	},
);

it.each([false, true])(
	'aborts a removed nested query while its outer boundary remains pending (dev=%s)',
	async (dev) => {
		const { App } = loadCompiledFixtureSource(
			`import { Suspense } from 'octane';
import { query$ } from 'octane/signals';
type Load = (id: string, context: { signal: AbortSignal }) => Promise<string>;
function Field(props: { id: string; load: Load }) {
	const value$ = query$(() => props.id, props.load);
	return <output data-name={props.id}>{String(value$.get())}</output>;
}
export function App(props: { showInner: boolean; load: Load }) {
	return <Suspense fallback={<i>outer waiting</i>}><section>
		{props.showInner ? <Suspense fallback={<u>inner waiting</u>}><Field id="inner" load={props.load}/></Suspense> : <b>removed</b>}
		<Field id="outer" load={props.load}/>
	</section></Suspense>;
}`,
			{
				id: '/removed-nested-query.tsx',
				mode: 'client',
				compileOptions: { dev, hmr: false },
				runtimeModules: { 'octane/signals': signals },
			},
		);
		const { pending, load } = requests();
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		const checkpoints: Record<string, unknown>[] = [];
		const record = (stage: string) =>
			checkpoints.push({
				stage,
				requests: pending.map(({ id, signal }) => ({ id, aborted: signal.aborted })),
				text: container.textContent,
			});
		try {
			await act(() => root.render(App, { showInner: true, load }));
			expect(pending.map(({ id }) => id).sort()).toEqual(['inner', 'outer']);
			const inner = pending.find(({ id }) => id === 'inner')!;
			const outer = pending.find(({ id }) => id === 'outer')!;
			await act(() => root.render(App, { showInner: false, load }));
			record('after inner removal');
			expect.soft(container.querySelector('i')?.textContent).toBe('outer waiting');
			expect.soft(inner.signal.aborted).toBe(true);
			expect.soft(outer.signal.aborted).toBe(false);
			await act(() => inner.resolve('obsolete inner'));
			record('after inner request resolves');
			expect.soft(container.querySelector('[data-name="inner"]')).toBeNull();
			await act(() => outer.resolve('outer result'));
			record('after outer request resolves');
			expect.soft(container.textContent).toBe('removedouter result');
		} finally {
			root.unmount();
			record('after unmount');
			console.log(JSON.stringify({ case: 'nested removal', dev, checkpoints }));
			container.remove();
		}
	},
);

const tsrxField = `import { Suspense, use } from 'octane';
import { query$ } from 'octane/signals';
type Load = (id: string, context: { signal: AbortSignal }) => Promise<string>;
function Field(props: { id: string; load: Load }) @{
	const value$ = query$(() => props.id, props.load);
	<output data-name={props.id}>{value$}</output>
}
function Plain(props: { id: string }) @{ <b>{props.id}</b> }
function Gate(props: { wait: Promise<void> | null }) @{
	if (props.wait !== null) use(props.wait);
	<i>gate</i>
}
`;

function compileTsrx(name: string, app: string, dev: boolean) {
	return loadCompiledFixtureSource(tsrxField + app, {
		id: `/pending-query-owner-${name}.tsrx`,
		mode: 'client',
		compileOptions: { dev, hmr: false },
		runtimeModules: { 'octane/signals': signals },
	}).App;
}

const replacements = {
	arm: `export function App(props: { show: boolean; load: Load }) @{
	<Suspense fallback={<i>waiting</i>}><section>
		@if (props.show) { <Field id="inner" load={props.load}/> } @else { <b>removed</b> }
		<Field id="outer" load={props.load}/>
	</section></Suspense>
}`,
	component: `export function App(props: { show: boolean; load: Load }) @{
	<Suspense fallback={<i>waiting</i>}><section>
		{props.show ? <Field id="inner" load={props.load}/> : <Plain id="removed"/>}
		<Field id="outer" load={props.load}/>
	</section></Suspense>
}`,
};

it.each(
	(['arm', 'component'] as const).flatMap((kind) => [false, true].map((dev) => ({ kind, dev }))),
)(
	'retires a pending query whose $kind is replaced while a later sibling suspends (dev=$dev)',
	async ({ kind, dev }) => {
		const App = compileTsrx(kind, replacements[kind], dev);
		const { pending, load } = requests();
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		try {
			await act(() => root.render(App, { show: true, load }));
			expect(pending.map(({ id }) => id)).toEqual(['inner']);
			const inner = pending[0]!;
			await act(() => root.render(App, { show: false, load }));
			expect(container.querySelector('i')?.textContent).toBe('waiting');
			expect(pending.map(({ id }) => id)).toEqual(['inner', 'outer']);
			expect(inner.signal.aborted).toBe(true);
			const outer = pending[1]!;
			expect(outer.signal.aborted).toBe(false);
			await act(() => outer.resolve('outer result'));
			expect(container.querySelector('section')?.textContent).toBe('removedouter result');
			expect(pending).toHaveLength(2);
		} finally {
			root.unmount();
			container.remove();
		}
	},
);

it.each([false, true])(
	'keeps a pending query that a restarted attempt suspends before reaching (dev=%s)',
	async (dev) => {
		const App = compileTsrx(
			'unreached',
			`type Props = { gate: string; wait: Promise<void> | null; load: Load };
function Owner(props: Props) @{
	<section>
		<Gate key={props.gate} wait={props.wait}/>
		<Field id="later" load={props.load}/>
	</section>
}
export function App(props: Props) @{
	<Suspense fallback={<i>waiting</i>}><Owner key="owner" {...props}/></Suspense>
}`,
			dev,
		);
		const { pending, load } = requests();
		let open!: () => void;
		const wait = new Promise<void>((resolve) => (open = resolve));
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		try {
			await act(() => root.render(App, { gate: 'a', wait: null, load }));
			expect(pending.map(({ id }) => id)).toEqual(['later']);
			const later = pending[0]!;
			// The new gate suspends before the retried primary reaches Field.
			await act(() => root.render(App, { gate: 'b', wait, load }));
			expect(container.querySelector('i')?.textContent).toBe('waiting');
			expect(later.signal.aborted).toBe(false);
			await act(() => open());
			expect(pending).toHaveLength(1);
			expect(later.signal.aborted).toBe(false);
			await act(() => later.resolve('later result'));
			expect(container.querySelector('section')?.textContent).toBe('gatelater result');
		} finally {
			root.unmount();
			container.remove();
		}
	},
);

it.each(
	(['same', 'new'] as const).flatMap((ownerKey) => [false, true].map((dev) => ({ ownerKey, dev }))),
)(
	'settles a descendant query when a restarted owner renders key $ownerKey (dev=$dev)',
	async ({ ownerKey, dev }) => {
		const App = compileTsrx(
			'descendant',
			`function Owner(props: { load: Load }) @{ <article><Field id="a" load={props.load}/></article> }
export function App(props: { ownerKey: string; load: Load }) @{
	<Suspense fallback={<i>waiting</i>}><Owner key={props.ownerKey} load={props.load}/></Suspense>
}`,
			dev,
		);
		const { pending, load } = requests();
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		try {
			root.render(App, { ownerKey: 'same', load });
			flushSync(() => {});
			expect(pending.map(({ id }) => id)).toEqual(['a']);
			const first = pending[0]!;
			// A new inline loader restarts the primary; the selection is unchanged.
			const reload: typeof load = (id, context) => load(id, context);
			flushSync(() => root.render(App, { ownerKey, load: reload }));
			const replaced = ownerKey !== 'same';
			expect(first.signal.aborted).toBe(replaced);
			expect(pending).toHaveLength(replaced ? 2 : 1);
			await act(() => pending.at(-1)!.resolve('current'));
			expect(container.querySelector('output')?.textContent).toBe('current');
		} finally {
			root.unmount();
			container.remove();
		}
	},
);

it.each([false, true])(
	'keeps a pending query in a hole its owner has not reached until the attempt completes (dev=%s)',
	async (dev) => {
		const App = compileTsrx(
			'later-use',
			`type Props = { show: boolean; wait: Promise<string> | null; load: Load };
function Owner(props: Props) @{
	<section>
		{props.show ? <Field id="inner" load={props.load}/> : null}
		<i>{(props.wait === null ? 'open' : use(props.wait)) as string}</i>
	</section>
}
export function App(props: Props) @{
	<Suspense fallback={<u>waiting</u>}><Owner {...props}/></Suspense>
}`,
			dev,
		);
		const { pending, load } = requests();
		let open!: (value: string) => void;
		const wait = new Promise<string>((resolve) => (open = resolve));
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		try {
			await act(() => root.render(App, { show: true, wait: null, load }));
			expect(pending.map(({ id }) => id)).toEqual(['inner']);
			// Owner's text binding suspends before its render reaches the hole.
			await act(() => root.render(App, { show: false, wait, load }));
			expect(container.querySelector('u')?.textContent).toBe('waiting');
			expect(pending[0]!.signal.aborted).toBe(false);
			// The completed attempt renders no Field there.
			await act(() => open('opened'));
			expect(container.querySelector('section')?.textContent).toBe('opened');
			expect(pending).toHaveLength(1);
			expect(pending[0]!.signal.aborted).toBe(true);
		} finally {
			root.unmount();
			container.remove();
		}
	},
);

// A hookless same-module wrapper renders as a lite scope, not a Block.
const liteWrappers = {
	hole: `{props.show ? <Field id="inner" load={props.load}/> : null}`,
	arm: `@if (props.show) { <Field id="inner" load={props.load}/> }`,
};

it.each((['hole', 'arm'] as const).flatMap((kind) => [false, true].map((dev) => ({ kind, dev }))))(
	'retires a pending query that a lite wrapper stops rendering ($kind, dev=$dev)',
	async ({ kind, dev }) => {
		const App = compileTsrx(
			`lite-${kind}`,
			`type Props = { show: boolean; load: Load };
function Wrap(props: Props) @{ <section>${liteWrappers[kind]}<Field id="outer" load={props.load}/></section> }
export function App(props: Props) @{
	<Suspense fallback={<i>waiting</i>}><Wrap show={props.show} load={props.load}/></Suspense>
}`,
			dev,
		);
		const { pending, load } = requests();
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		try {
			await act(() => root.render(App, { show: true, load }));
			expect(pending.map(({ id }) => id)).toEqual(['inner']);
			const inner = pending[0]!;
			await act(() => root.render(App, { show: false, load }));
			expect(container.querySelector('i')?.textContent).toBe('waiting');
			expect(pending.map(({ id }) => id)).toEqual(['inner', 'outer']);
			expect(inner.signal.aborted).toBe(true);
			await act(() => pending[1]!.resolve('outer result'));
			expect(container.querySelector('section')?.textContent).toBe('outer result');
		} finally {
			root.unmount();
			container.remove();
		}
	},
);
