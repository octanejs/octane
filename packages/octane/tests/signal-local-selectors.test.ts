import { describe, expect, it } from 'vitest';
import * as signals from 'octane/signals';
import { act, startTransition } from 'octane';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// The octane project covers the dev compile; octane-prod covers prod and strong.
const modes =
	process.env.OCTANE_TEST_COMPILE_MODE === 'prod'
		? [
				{ dev: false, strong: false },
				{ dev: false, strong: true },
			]
		: [{ dev: true, strong: false }];

function load<T>(source: string, id: string, mode: { dev: boolean; strong: boolean }): T {
	return loadCompiledFixtureSource<any>(source, {
		id,
		mode: 'client',
		compileOptions: { ...mode, hmr: false },
		runtimeModules: { 'octane/signals': signals },
	});
}

interface Call {
	selection: string;
	signal: AbortSignal;
	resolve(value: string): void;
}

function controlledLoader() {
	const calls: Call[] = [];
	// Derived computations call the loader directly, without a query context.
	const loader = (selection: string, context?: { signal: AbortSignal }) =>
		new Promise<string>((resolve) =>
			calls.push({ selection, signal: context?.signal ?? new AbortController().signal, resolve }),
		);
	const selections = () => calls.map((call) => call.selection);
	return { calls, loader, selections };
}

const snapshotSource = `import { query$ } from 'octane/signals';
export function App(props) @{
 const r$ = query$(() => props.sel, props.load);
 const s = r$.snapshot();
 <p>{(s.status === 'ready' ? s.value : s.status) as string}</p>
}`;

const strictSource = `import { query$ } from 'octane/signals';
export function App(props) @{
 const r$ = query$(() => props.sel, props.load);
 <main>
  @try {
   <p>{r$.get() as string}</p>
  } @pending {
   <i>{'pending'}</i>
  }
 </main>
}`;

describe.each(modes)('redeclared local query selectors (%j)', (mode) => {
	// Compile at collection: a cold compile under load must not spend a test's timeout.
	const snapshot = load<any>(snapshotSource, '/local-selector-snapshot.tsrx', mode);
	const strict = load<any>(strictSource, '/local-selector-strict.tsrx', mode);
	it('reselects a snapshot read when its captured prop changes', async () => {
		const { App } = snapshot;
		const { calls, loader, selections } = controlledLoader();
		const root = mount(App, { sel: 'a', load: loader });
		const text = () => root.find('p').textContent;
		try {
			expect(text()).toBe('pending');
			await act(() => calls[0]!.resolve('A'));
			expect(text()).toBe('A');
			root.update(App, { sel: 'b', load: loader });
			expect(selections()).toEqual(['a', 'b']);
			expect(text()).toBe('pending');
			await act(() => calls[1]!.resolve('B'));
			expect(text()).toBe('B');
			root.update(App, { sel: 'c', load: loader });
			expect(selections()).toEqual(['a', 'b', 'c']);
			await act(() => calls[2]!.resolve('C'));
			expect(text()).toBe('C');
			expect(calls.map((call) => call.signal.aborted)).toEqual([false, false, false]);
		} finally {
			root.unmount();
		}
	});

	it('aborts an obsolete request and dedupes an equal selection', async () => {
		const { App } = snapshot;
		const { calls, loader, selections } = controlledLoader();
		const root = mount(App, { sel: 'a', load: loader });
		const text = () => root.find('p').textContent;
		try {
			root.update(App, { sel: 'b', load: loader });
			// The unsettled first selection has no remaining consumer.
			expect(calls[0]!.signal.aborted).toBe(true);
			// A new props object with an equal canonical selection shares the request.
			root.update(App, { sel: 'b', load: loader });
			root.update(App, { sel: 'b', load: loader, unrelated: 1 });
			expect(selections()).toEqual(['a', 'b']);
			expect(calls[1]!.signal.aborted).toBe(false);
			await act(() => calls[0]!.resolve('obsolete'));
			expect(text()).toBe('pending');
			await act(() => calls[1]!.resolve('B'));
			expect(text()).toBe('B');
			root.update(App, { sel: 'b', load: loader });
			expect(selections()).toEqual(['a', 'b']);
			expect(text()).toBe('B');
		} finally {
			root.unmount();
		}
		// Unmounting aborts nothing that already settled.
		expect(calls[1]!.signal.aborted).toBe(false);
	});

	const localSelectorLoader = load<any>(
		`import { query$ } from 'octane/signals';
export function App(props) @{
 const r$ = query$(() => props.id, (id) => props.load(id, props.label));
 const s = r$.snapshot();
 <p>{(s.status === 'ready' ? s.value : s.status) as string}</p>
}`,
		'/local-selector-loader.tsrx',
		mode,
	);
	it('adopts a redeclared inline loader without refetching an equal selection', async () => {
		const { App } = localSelectorLoader;
		const loads: string[] = [];
		const loader = async (id: string, label: string) => {
			loads.push(`${id}:${label}`);
			return `${id}:${label}`;
		};
		const errors: unknown[] = [];
		const root = mount(App, { id: 'a', label: 'first', load: loader });
		try {
			await act(async () => {});
			expect(root.find('p').textContent).toBe('a:first');
			root.update(App, { id: 'a', label: 'second', load: loader });
			await act(async () => {});
			expect(root.find('p').textContent).toBe('a:first');
			root.update(App, { id: 'b', label: 'third', load: loader });
			await act(async () => {});
			expect(root.find('p').textContent).toBe('b:third');
			expect(loads).toEqual(['a:first', 'b:third']);
			expect(errors).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	const localSelectorDependencies = load<any>(
		`import { query$ } from 'octane/signals';
export function App(props) @{
 const r$ = query$(() => (props.useB ? props.b$ : props.a$).get(), props.load);
 const s = r$.snapshot();
 <p>{(s.status === 'ready' ? s.value : s.status) as string}</p>
}`,
		'/local-selector-dependencies.tsrx',
		mode,
	);
	it('tracks the accepted closure after an equal selection', async () => {
		const { App } = localSelectorDependencies;
		const scope = signals.createScope({ scopeKey: 'local-selector-dependencies' });
		const a$ = scope.signal$('a', '1');
		const b$ = scope.signal$('b', '1');
		const loads: string[] = [];
		const loader = async (selection: string) => {
			loads.push(selection);
			return selection;
		};
		const root = mount(App, { useB: false, a$, b$, load: loader });
		try {
			await act(async () => {});
			root.update(App, { useB: true, a$, b$, load: loader });
			await act(async () => {});
			expect(loads).toEqual(['1']);
			// The accepted closure now depends on b$, and no longer on a$.
			await act(() => b$.set('2'));
			expect(root.find('p').textContent).toBe('2');
			await act(() => a$.set('3'));
			expect(root.find('p').textContent).toBe('2');
			expect(loads).toEqual(['1', '2']);
		} finally {
			root.unmount();
			scope.dispose();
		}
	});

	const localSelectorLaterSignal = load<any>(
		`import { query$ } from 'octane/signals';
export function App(props) @{
 const r$ = query$(() => (props.key$.get() === 'special' ? props.alt : props.key$.get()), props.load);
 const s = r$.snapshot();
 <p>{(s.status === 'ready' ? s.value : s.status) as string}</p>
}`,
		'/local-selector-later-signal.tsrx',
		mode,
	);
	it('adopts a closure whose captured value only matters after a signal changes', async () => {
		const { App } = localSelectorLaterSignal;
		const scope = signals.createScope({ scopeKey: 'local-selector-later-signal' });
		const key$ = scope.signal$('key', '1');
		const loads: string[] = [];
		const loader = async (selection: string) => {
			loads.push(selection);
			return selection;
		};
		const root = mount(App, { alt: 'first', key$, load: loader });
		try {
			await act(async () => {});
			root.update(App, { alt: 'second', key$, load: loader });
			await act(async () => {});
			expect(loads).toEqual(['1']);
			await act(() => key$.set('special'));
			await act(async () => {});
			expect(root.find('p').textContent).toBe('second');
			expect(loads).toEqual(['1', 'second']);
		} finally {
			root.unmount();
			scope.dispose();
		}
	});

	const localSelectorFailure = load<any>(
		`import { query$ } from 'octane/signals';
export function App(props) @{
 const r$ = query$(() => {
  if (props.fail) throw new Error('bad selector');
  return props.sel;
 }, props.load);
 const s = r$.snapshot();
 <p>{(s.status === 'error' ? (s.error as Error).message : s.status === 'ready' ? s.value : s.status) as string}</p>
}`,
		'/local-selector-failure.tsrx',
		mode,
	);
	it('reports a failing selector and recovers on the next declaration', async () => {
		const { App } = localSelectorFailure;
		const { calls, loader, selections } = controlledLoader();
		const root = mount(App, { sel: 'a', load: loader });
		const text = () => root.find('p').textContent;
		try {
			await act(() => calls[0]!.resolve('A'));
			root.update(App, { sel: 'a', fail: true, load: loader });
			expect(text()).toBe('bad selector');
			root.update(App, { sel: 'b', load: loader });
			expect(selections()).toEqual(['a', 'b']);
			await act(() => calls[1]!.resolve('B'));
			expect(text()).toBe('B');
		} finally {
			root.unmount();
		}
	});

	const localSelectorEffect = load<any>(
		`import { useEffect } from 'octane';
import { query$ } from 'octane/signals';
export function App(props) @{
 const r$ = query$(() => props.id, props.load);
 useEffect(() => {
  props.seen(r$.snapshot().status);
 });
 <p>{props.id as string}</p>
}`,
		'/local-selector-effect.tsrx',
		mode,
	);
	it('reads the latest accepted declaration outside rendering', async () => {
		const { App } = localSelectorEffect;
		const { loader, selections } = controlledLoader();
		const seen: string[] = [];
		const props = { load: loader, seen: (status: string) => seen.push(status) };
		const root = mount(App, { ...props, id: '1' });
		try {
			await act(async () => {});
			root.update(App, { ...props, id: '2' });
			await act(async () => {});
			// The effect belongs to the accepted render, so its handle selects '2'.
			expect(selections()).toEqual(['1', '2']);
			expect(seen).toEqual(['pending', 'pending']);
		} finally {
			root.unmount();
		}
	});

	// Strong mode rejects render-phase state updates at compile time.
	const localSelectorRenderPhase = mode.strong
		? undefined
		: load<any>(
				`import { useState } from 'octane';
import { query$ } from 'octane/signals';
export function App(props) @{
 const [page, setPage] = useState(1);
 const [filter, setFilter] = useState(props.filter);
 if (filter !== props.filter) {
  setFilter(props.filter);
  setPage(1);
 }
 const r$ = query$(() => props.filter + ':' + page, props.load);
 const s = r$.snapshot();
 <main>
  <button onClick={() => setPage(page + 1)}>{'next'}</button>
  <p>{(s.status === 'ready' ? s.value : s.status) as string}</p>
 </main>
}`,
				'/local-selector-render-phase.tsrx',
				mode,
			);
	it.runIf(!mode.strong)(
		'stages the selection of a body rerun after a render-phase update',
		async () => {
			const { App } = localSelectorRenderPhase!;
			const { calls, loader, selections } = controlledLoader();
			const root = mount(App, { filter: 'a', load: loader });
			const text = () => root.find('p').textContent;
			try {
				await act(() => calls[0]!.resolve('a:1'));
				await act(() => root.click('button'));
				await act(() => calls[1]!.resolve('a:2'));
				expect(text()).toBe('a:2');
				root.update(App, { filter: 'b', load: loader });
				// The rerun that resets the page owns the accepted selection. The
				// first pass's stale page is aborted and never accepted.
				expect(selections()).toEqual(['a:1', 'a:2', 'b:2', 'b:1']);
				expect(calls[2]!.signal.aborted).toBe(true);
				await act(() => calls[3]!.resolve('b:1'));
				expect(text()).toBe('b:1');
			} finally {
				root.unmount();
			}
		},
	);

	it('reselects a strict read under @try after the boundary has settled', async () => {
		const { App } = strict;
		const { calls, loader, selections } = controlledLoader();
		const root = mount(App, { sel: 'a', load: loader });
		const view = () => root.find('main').textContent;
		try {
			expect(view()).toBe('pending');
			await act(() => calls[0]!.resolve('A'));
			expect(view()).toBe('A');
			root.update(App, { sel: 'b', load: loader });
			expect(selections()).toEqual(['a', 'b']);
			await act(() => calls[1]!.resolve('B'));
			expect(view()).toBe('B');
			root.update(App, { sel: 'c', load: loader });
			expect(selections()).toEqual(['a', 'b', 'c']);
			await act(() => calls[2]!.resolve('C'));
			expect(view()).toBe('C');
		} finally {
			root.unmount();
		}
	});
});

const transitionSource = `import { useState, useTransition } from 'octane';
import { query$ } from 'octane/signals';
function Panel(props) @{
 const r$ = query$(() => props.sel, props.load);
 <section>
  <em class="count">{String(props.count)}</em>
  @try {
   <p class="value">{r$.get() as string}</p>
  } @pending {
   <p class="pending">{'pending'}</p>
  }
 </section>
}
export function App(props) @{
 const [sel, setSel] = useState('a');
 const [count, setCount] = useState(0);
 const [isPending, startTransition] = useTransition();
 <main>
  <button class="to-b" onClick={() => startTransition(() => setSel('b'))}>{'b'}</button>
  <button class="to-c" onClick={() => startTransition(() => setSel('c'))}>{'c'}</button>
  <button class="to-a" onClick={() => setSel('a')}>{'a'}</button>
  <button class="bump" onClick={() => setCount(count + 1)}>{'+'}</button>
  <span class="busy">{isPending ? 'busy' : 'idle'}</span>
  <Panel sel={sel} count={count} load={props.load} />
 </main>
}`;

describe.each(modes)('redeclared selectors in speculative renders (%j)', (mode) => {
	const transition = load<any>(transitionSource, '/local-selector-transition.tsrx', mode);
	function setup() {
		const { App } = transition;
		const loader = controlledLoader();
		const root = mount(App, { load: loader.loader });
		const view = () => ({
			busy: root.find('.busy').textContent,
			count: root.find('.count').textContent,
			value: root.container.querySelector('.value')?.textContent ?? null,
			pending: root.container.querySelector('.pending') !== null,
		});
		return { root, view, ...loader };
	}

	it('keeps the committed selection while a transition holds a new one', async () => {
		const { root, view, calls, selections } = setup();
		try {
			await act(() => calls[0]!.resolve('A'));
			expect(view()).toEqual({
				busy: 'idle',
				count: '0',
				value: 'A',
				pending: false,
			});
			await act(() => root.click('.to-b'));
			expect(selections()).toEqual(['a', 'b']);
			expect(view()).toEqual({ busy: 'busy', count: '0', value: 'A', pending: false });
			// An urgent render during the hold still reads the accepted selection.
			await act(() => root.click('.bump'));
			expect(view()).toEqual({ busy: 'busy', count: '1', value: 'A', pending: false });
			expect(selections()).toEqual(['a', 'b']);
			await act(() => calls[1]!.resolve('B'));
			expect(view()).toEqual({ busy: 'idle', count: '1', value: 'B', pending: false });
			// The held request was adopted, not started again by the accepted render.
			expect(selections()).toEqual(['a', 'b']);
			expect(calls[1]!.signal.aborted).toBe(false);
		} finally {
			root.unmount();
		}
	});

	it('aborts a held selection when its component unmounts', async () => {
		const { root, calls, selections } = setup();
		let unmounted = false;
		try {
			await act(() => calls[0]!.resolve('A'));
			await act(() => root.click('.to-b'));
			expect(selections()).toEqual(['a', 'b']);
			root.unmount();
			unmounted = true;
			expect(calls[1]!.signal.aborted).toBe(true);
		} finally {
			if (!unmounted) root.unmount();
		}
	});

	it('replaces a held selection with a newer transition', async () => {
		const { root, view, calls, selections } = setup();
		try {
			await act(() => calls[0]!.resolve('A'));
			await act(() => root.click('.to-b'));
			await act(() => root.click('.to-c'));
			expect(selections()).toEqual(['a', 'b', 'c']);
			expect(calls[1]!.signal.aborted).toBe(true);
			expect(view()).toEqual({ busy: 'busy', count: '0', value: 'A', pending: false });
			await act(() => calls[1]!.resolve('obsolete'));
			expect(view().value).toBe('A');
			await act(() => calls[2]!.resolve('C'));
			expect(view()).toEqual({ busy: 'idle', count: '0', value: 'C', pending: false });
			expect(selections()).toEqual(['a', 'b', 'c']);
		} finally {
			root.unmount();
		}
	});

	it('keeps the accepted request when an urgent update abandons a held selection', async () => {
		const { root, view, calls, selections } = setup();
		try {
			await act(() => calls[0]!.resolve('A'));
			await act(() => root.click('.to-b'));
			await act(() => root.click('.to-a'));
			expect(view().value).toBe('A');
			await act(() => calls[1]!.resolve('B'));
			expect(view()).toEqual({ busy: 'idle', count: '0', value: 'A', pending: false });
			// The accepted selection was never released, so nothing refetches it.
			expect(selections()).toEqual(['a', 'b']);
			expect(calls[0]!.signal.aborted).toBe(false);
		} finally {
			root.unmount();
		}
	});
});

const signalTransitionSource = `import { useState } from 'octane';
import { query$ } from 'octane/signals';
function Panel(props) @{
 const r$ = query$(() => props.sel, props.load);
 <section>
  <em class="count">{String(props.count)}</em>
  @try {
   <p class="value">{r$.get() as string}</p>
  } @pending {
   <p class="pending">{'pending'}</p>
  }
 </section>
}
export function App(props) @{
 const [count, setCount] = useState(0);
 <main>
  <button class="bump" onClick={() => setCount(count + 1)}>{'+'}</button>
  <Panel sel={props.sel$.get()} count={count} load={props.load} />
 </main>
}`;

describe.each(modes)('redeclared selectors in signal transitions (%j)', (mode) => {
	const signalTransition = load<any>(
		signalTransitionSource,
		'/local-selector-signal-write.tsrx',
		mode,
	);
	it('publishes a selection written by a transition only when it is accepted', async () => {
		const { App } = signalTransition;
		const { calls, loader, selections } = controlledLoader();
		const scope = signals.createScope({ scopeKey: 'local-selector-signal-write' });
		const sel$ = scope.signal$('sel', 'a');
		const root = mount(App, { sel$, load: loader });
		const view = () => ({
			count: root.find('.count').textContent,
			value: root.container.querySelector('.value')?.textContent ?? null,
		});
		try {
			await act(() => calls[0]!.resolve('A'));
			await act(() => startTransition(() => sel$.set('b')));
			expect(selections()).toEqual(['a', 'b']);
			expect(sel$.get()).toBe('a');
			expect(view()).toEqual({ count: '0', value: 'A' });
			await act(() => root.click('.bump'));
			expect(view()).toEqual({ count: '1', value: 'A' });
			await act(() => calls[1]!.resolve('B'));
			expect(sel$.get()).toBe('b');
			expect(view()).toEqual({ count: '1', value: 'B' });
			expect(selections()).toEqual(['a', 'b']);
		} finally {
			root.unmount();
			scope.dispose();
		}
	});
});

describe.each(modes)('redeclared local derived computations (%j)', (mode) => {
	const localDerivedSync = load<any>(
		`import { derived$, signal$ } from 'octane/signals';
export function App(props) @{
 const n$ = signal$(1);
 const label$ = derived$(() => props.label + n$.get());
 const shout$ = derived$(() => label$.get().toUpperCase());
 <p>
  <b>{label$.get() as string}</b>
  <i>{shout$}</i>
  <button onClick={() => n$.set(n$.get() + 1)}>{'+'}</button>
 </p>
}`,
		'/local-derived-sync.tsrx',
		mode,
	);
	it('recomputes a synchronous derived value from captured props', async () => {
		const { App } = localDerivedSync;
		const root = mount(App, { label: 'a' });
		const view = () => [root.find('b').textContent, root.find('i').textContent];
		try {
			expect(view()).toEqual(['a1', 'A1']);
			root.update(App, { label: 'b' });
			expect(view()).toEqual(['b1', 'B1']);
			// A dependency change recomputes with the accepted closure.
			await act(() => root.click('button'));
			expect(view()).toEqual(['b2', 'B2']);
			root.update(App, { label: 'c' });
			expect(view()).toEqual(['c2', 'C2']);
		} finally {
			root.unmount();
		}
	});

	const localDerivedLaterSignal = load<any>(
		`import { derived$, signal$ } from 'octane/signals';
export function App(props) @{
 const n$ = signal$(1);
 const size$ = derived$(() => (n$.get() > 5 ? props.big : 'small'));
 <p>
  <b>{size$}</b>
  <button onClick={() => n$.set(10)}>{'grow'}</button>
 </p>
}`,
		'/local-derived-later-signal.tsrx',
		mode,
	);
	it('adopts a derived closure whose captured value only matters after a signal changes', async () => {
		const { App } = localDerivedLaterSignal;
		const root = mount(App, { big: 'first' });
		try {
			expect(root.find('b').textContent).toBe('small');
			root.update(App, { big: 'second' });
			expect(root.find('b').textContent).toBe('small');
			// The direct binding updates without rerunning the body, so only the
			// accepted closure can supply the new captured value.
			await act(() => root.click('button'));
			expect(root.find('b').textContent).toBe('second');
		} finally {
			root.unmount();
		}
	});

	const localDerivedHeld = load<any>(
		`import { useState, useTransition } from 'octane';
import { derived$, query$ } from 'octane/signals';
function Panel(props) @{
 const upper$ = derived$(() => props.sel.toUpperCase() + props.count);
 const r$ = query$(() => props.sel, props.load);
 <section>
  <em>{upper$.get() as string}</em>
  @try {
   <p class="value">{r$.get() as string}</p>
  } @pending {
   <p class="pending">{'pending'}</p>
  }
 </section>
}
export function App(props) @{
 const [sel, setSel] = useState('a');
 const [count, setCount] = useState(0);
 const [isPending, startTransition] = useTransition();
 <main>
  <button class="to-b" onClick={() => startTransition(() => setSel('b'))}>{'b'}</button>
  <button class="bump" onClick={() => setCount(count + 1)}>{'+'}</button>
  <span class="busy">{isPending ? 'busy' : 'idle'}</span>
  <Panel sel={sel} count={count} load={props.load} />
 </main>
}`,
		'/local-derived-held.tsrx',
		mode,
	);
	it('keeps the committed derived value while a transition holds new props', async () => {
		const { App } = localDerivedHeld;
		const { calls, loader } = controlledLoader();
		const root = mount(App, { load: loader });
		const view = () => [
			root.find('.busy').textContent,
			root.find('em').textContent,
			root.container.querySelector('.value')?.textContent ?? null,
		];
		try {
			await act(() => calls[0]!.resolve('first'));
			expect(view()).toEqual(['idle', 'A0', 'first']);
			await act(() => root.click('.to-b'));
			expect(view()).toEqual(['busy', 'A0', 'first']);
			await act(() => root.click('.bump'));
			expect(view()).toEqual(['busy', 'A1', 'first']);
			await act(() => calls[1]!.resolve('second'));
			expect(view()).toEqual(['idle', 'B1', 'second']);
		} finally {
			root.unmount();
		}
	});

	const localDerivedAsync = load<any>(
		`import { derived$ } from 'octane/signals';
export function App(props) @{
 const value$ = derived$(async () => props.load(props.id + ':' + props.version$.get()));
 const s = value$.snapshot();
 <p>{(s.status === 'ready' ? s.value : s.status) as string}</p>
}`,
		'/local-derived-async.tsrx',
		mode,
	);
	it('adopts an asynchronous computation for its next restart without refetching', async () => {
		const { App } = localDerivedAsync;
		const scope = signals.createScope({ scopeKey: 'local-derived-async' });
		const version$ = scope.signal$('version', 0);
		const loads: string[] = [];
		const loader = async (key: string) => {
			loads.push(key);
			return `loaded ${key}`;
		};
		const root = mount(App, { id: '1', version$, load: loader });
		try {
			await act(async () => {});
			expect(root.find('p').textContent).toBe('loaded 1:0');
			// Without a selection identity, a redeclaration cannot be matched with
			// the attempt it would repeat. Keyed async work belongs in query$.
			root.update(App, { id: '2', version$, load: loader });
			root.update(App, { id: '2', version$, load: loader });
			await act(async () => {});
			expect(loads).toEqual(['1:0']);
			await act(() => version$.set(1));
			await act(async () => {});
			expect(root.find('p').textContent).toBe('loaded 2:1');
			expect(loads).toEqual(['1:0', '2:1']);
		} finally {
			root.unmount();
			scope.dispose();
		}
	});

	const localDerivedFlip = load<any>(
		`import { useState, useTransition } from 'octane';
import { derived$ } from 'octane/signals';
function Panel(props) @{
 const value$ = derived$(() => (props.id ? props.load(props.id) : 'none'));
 <section>
  @try {
   <p>{value$.get() as string}</p>
  } @pending {
   <i>{'pending'}</i>
  }
 </section>
}
export function App(props) @{
 const [id, setId] = useState(null);
 const [isPending, startTransition] = useTransition();
 <main>
  <button onClick={() => startTransition(() => setId('5'))}>{'load'}</button>
  <span>{isPending ? 'busy' : 'idle'}</span>
  <Panel id={id} load={props.load} />
 </main>
}`,
		'/local-derived-flip.tsrx',
		mode,
	);
	it('starts asynchronous derived work once when a transition makes it asynchronous', async () => {
		const { App } = localDerivedFlip;
		const { calls, loader, selections } = controlledLoader();
		const root = mount(App, { load: loader });
		const view = () => [
			root.find('span').textContent,
			root.container.querySelector('p:not([style])')?.textContent ?? null,
		];
		try {
			expect(view()).toEqual(['idle', 'none']);
			// A render that may be discarded never presents the new asynchronous
			// work, so a retry cannot start it again. Acceptance adopts the attempt.
			await act(() => root.click('button'));
			expect(selections()).toEqual(['5']);
			await act(() => calls[0]!.resolve('loaded 5'));
			await act(async () => {});
			expect(view()).toEqual(['idle', 'loaded 5']);
			expect(selections()).toEqual(['5']);
		} finally {
			root.unmount();
		}
	});
});
