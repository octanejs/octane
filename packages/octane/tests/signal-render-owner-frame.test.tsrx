import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, flushSync, startTransition, use } from 'octane';
import * as signals from 'octane/signals';
import {
	createScope,
	currentSignalOwner,
	installSignalOwnerEnvironment,
	runWithSignalOwner,
	ScopeDisposedError,
	signal$,
	type SignalHandle,
	type SignalOwner,
} from 'octane/signals';
import { act } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// Every rendered Block, and every lightweight component scope, runs its body
// and template in a signal owner of its own. The owner that was current before
// a render is current again once the render returns, throws to a boundary,
// suspends, or is held by a transition. With a host carrier installed, each
// Block enters its owner through the carrier.

type Log = Array<[label: string, owner: SignalOwner | null]>;

// A module declaration read natively enables the document signal owner.
const label$ = signal$('ready');

function mark(log: Log, label: string): string {
	log.push([label, currentSignalOwner()]);
	return '';
}

function ownerOf(log: Log, label: string): SignalOwner | null {
	const entries = log.filter(([entry]) => entry === label);
	expect(entries.length).toBeGreaterThan(0);
	return entries[0]![1];
}

function isRendererOwner(owner: SignalOwner | null): boolean {
	return owner !== null && typeof owner === 'object' && 'documentOwner' in owner;
}

function Leaf(props: { id: string; log: Log }) @{
	props.log.push(['leaf ' + props.id, currentSignalOwner()]);
	<i>{label$.get() as string}</i>
}

function Row(props: { id: string; log: Log }) @{
	props.log.push(['row ' + props.id, currentSignalOwner()]);
	<li>
		<Leaf id={props.id} log={props.log} />
		{mark(props.log, 'row hole ' + props.id) as string}
	</li>
}

function List(props: { ids: string[]; log: Log }) @{
	props.log.push(['list', currentSignalOwner()]);
	<ul>
		@for (const id of props.ids; key id) {
			<Row id={id} log={props.log} />
		}
		{mark(props.log, 'list hole') as string}
	</ul>
}

function Boom(props: { log: Log }): never {
	props.log.push(['boom', currentSignalOwner()]);
	throw new Error('boom');
}

function Guarded(props: { log: Log }) @{
	props.log.push(['guarded', currentSignalOwner()]);
	<section>
		@try {
			<Boom log={props.log} />
		} @catch (_error) {
			<p>{'caught'}</p>
		}
		{mark(props.log, 'guarded hole') as string}
	</section>
}

function Waiting(props: { promise: Promise<string>; log: Log }) @{
	props.log.push(['waiting', currentSignalOwner()]);
	const value = use(props.promise);
	<b>{value}</b>
}

function Suspending(props: { promise: Promise<string>; log: Log }) @{
	props.log.push(['suspending', currentSignalOwner()]);
	<section>
		@try {
			<Waiting promise={props.promise} log={props.log} />
		} @pending {
			<i>{'pending'}</i>
		}
		{mark(props.log, 'suspending hole') as string}
	</section>
}

function deferred(): { promise: Promise<string>; resolve: (value: string) => void } {
	let resolve!: (value: string) => void;
	const promise = new Promise<string>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
	while (cleanups.length !== 0) cleanups.pop()!();
});

function container(): HTMLElement {
	const element = document.createElement('div');
	document.body.append(element);
	cleanups.push(() => element.remove());
	return element;
}

describe('signal owner frame of a rendering Block', () => {
	it('renders each Block in its own owner and restores the caller owner', () => {
		const log: Log = [];
		const ambient = currentSignalOwner();
		const root = createRoot(container());
		cleanups.push(() => root.unmount());
		root.render(List, { ids: ['a', 'b'], log });
		expect(currentSignalOwner()).toBe(ambient);

		const list = ownerOf(log, 'list');
		expect(isRendererOwner(list)).toBe(true);
		expect(ownerOf(log, 'list hole')).toBe(list);
		const owners = new Set([list]);
		for (const id of ['a', 'b']) {
			const row = ownerOf(log, 'row ' + id);
			const leaf = ownerOf(log, 'leaf ' + id);
			expect(isRendererOwner(row)).toBe(true);
			expect(isRendererOwner(leaf)).toBe(true);
			expect(ownerOf(log, 'row hole ' + id)).toBe(row);
			owners.add(row).add(leaf);
		}
		expect(owners.size).toBe(5);

		// A re-render enters the same owners again, from an ambient frame.
		log.length = 0;
		flushSync(() => root.render(List, { ids: ['a', 'b'], log }));
		expect(currentSignalOwner()).toBe(ambient);
		expect(ownerOf(log, 'list')).toBe(list);
		expect(ownerOf(log, 'list hole')).toBe(list);
	});

	it('restores the caller-provided owner around a root render', () => {
		const log: Log = [];
		const explicit = { scopeKey: 'render-owner-frame-explicit' };
		const root = createRoot(container());
		cleanups.push(() => root.unmount());
		const after = runWithSignalOwner(explicit, () => {
			root.render(List, { ids: ['a'], log });
			return currentSignalOwner();
		});
		expect(after).toBe(explicit);
		expect(ownerOf(log, 'list')).not.toBe(explicit);
		expect(ownerOf(log, 'list hole')).toBe(ownerOf(log, 'list'));
	});

	it('restores the caller owner after a child throws to a caught boundary', () => {
		const log: Log = [];
		const ambient = currentSignalOwner();
		const host = container();
		const root = createRoot(host);
		cleanups.push(() => root.unmount());
		root.render(Guarded, { log });
		expect(host.textContent).toBe('caught');
		expect(currentSignalOwner()).toBe(ambient);
		const guarded = ownerOf(log, 'guarded');
		expect(isRendererOwner(guarded)).toBe(true);
		expect(ownerOf(log, 'boom')).not.toBe(guarded);
		expect(ownerOf(log, 'guarded hole')).toBe(guarded);
	});

	it('replays a suspended Block in the owner of its first attempt', async () => {
		const log: Log = [];
		const ambient = currentSignalOwner();
		const host = container();
		const root = createRoot(host);
		cleanups.push(() => root.unmount());
		const first = deferred();
		root.render(Suspending, { promise: first.promise, log });
		expect(host.textContent).toBe('pending');
		expect(currentSignalOwner()).toBe(ambient);
		const suspending = ownerOf(log, 'suspending');
		expect(ownerOf(log, 'suspending hole')).toBe(suspending);
		const waiting = ownerOf(log, 'waiting');
		expect(isRendererOwner(waiting)).toBe(true);

		await act(async () => first.resolve('first'));
		expect(host.textContent).toBe('first');
		expect(currentSignalOwner()).toBe(ambient);
		const attempts = log.filter(([label]) => label === 'waiting').map(([, owner]) => owner);
		expect(attempts.length).toBeGreaterThan(1);
		for (const owner of attempts) expect(owner).toBe(waiting);

		// A transition that suspends keeps the committed output and retries the
		// held attempt in its owner as well.
		log.length = 0;
		const second = deferred();
		await act(() =>
			startTransition(() => root.render(Suspending, { promise: second.promise, log })),
		);
		expect(host.textContent).toBe('first');
		expect(currentSignalOwner()).toBe(ambient);
		await act(async () => second.resolve('second'));
		expect(host.textContent).toBe('second');
		expect(currentSignalOwner()).toBe(ambient);
		const held = log.filter(([label]) => label === 'waiting').map(([, owner]) => owner);
		expect(held.length).toBeGreaterThan(1);
		for (const owner of held) expect(owner).toBe(waiting);
	});

	it('renders a lightweight component scope in its own owner', () => {
		// A hookless child that calls no signal API compiles to a lightweight scope
		// in production. Vitest's production plugin inlines same-module private
		// components, so compile the module directly to keep the component slot.
		const { Parent } = loadCompiledFixtureSource(
			`import { signal$ } from 'octane/signals';
const label$ = signal$('lite');
function Tag(props) @{
	props.record('tag');
	<em>{label$}</em>
}
export function Parent(props) @{
	props.record('parent');
	<p>
		<Tag record={props.record} />
		{props.record('parent hole') as string}
	</p>
}`,
			{
				id: '/src/lite-owner-frame.tsrx',
				mode: 'client',
				compileOptions: { dev: false, hmr: false },
				runtimeModules: { 'octane/signals': signals },
			},
		);
		const log: Log = [];
		const ambient = currentSignalOwner();
		const host = container();
		const root = createRoot(host);
		cleanups.push(() => root.unmount());
		root.render(Parent, { record: (label: string) => mark(log, label) });
		expect(host.textContent).toBe('lite');
		expect(currentSignalOwner()).toBe(ambient);
		const parent = ownerOf(log, 'parent');
		const tag = ownerOf(log, 'tag');
		expect(isRendererOwner(parent)).toBe(true);
		expect(isRendererOwner(tag)).toBe(true);
		expect(tag).not.toBe(parent);
		expect(ownerOf(log, 'parent hole')).toBe(parent);
	});

	it('enters each Block owner through an installed host carrier', () => {
		const stack: SignalOwner[] = [];
		const entered: SignalOwner[] = [];
		function run<T>(owner: SignalOwner, callback: () => T): T {
			entered.push(owner);
			stack.push(owner);
			try {
				return callback();
			} finally {
				stack.pop();
			}
		}
		cleanups.push(
			installSignalOwnerEnvironment({
				current: () => stack.at(-1) ?? null,
				run,
				capture: (owner) => (callback) => run(owner, callback),
			}),
		);
		const log: Log = [];
		const root = createRoot(container());
		cleanups.push(() => root.unmount());
		root.render(List, { ids: ['a', 'b'], log });
		expect(stack).toEqual([]);
		const list = ownerOf(log, 'list');
		expect(ownerOf(log, 'list hole')).toBe(list);
		for (const label of ['list', 'row a', 'leaf a', 'row b', 'leaf b']) {
			const owner = ownerOf(log, label);
			expect(isRendererOwner(owner)).toBe(true);
			expect(entered).toContain(owner);
		}
	});
});

// A render creates its owner when something first asks for it. These
// components ask for none until told to, so what they record meanwhile (a
// handler, the children they pass, the frame a later sibling's props evaluate
// in) must still resolve to the owner their own render gets once it asks.
// Compiled directly, as above, so that production keeps each component slot:
// a lightweight scope there, a Block in development.
const QUIET = `import { signal$ } from 'octane/signals';
function Tag(props) @{
	if (props.loud) props.record('tag ' + props.id);
	<em>{props.label as string}</em>
}
export function Siblings(props) @{
	if (props.loud) props.record('siblings');
	<p>
		<Tag id="a" loud={props.loud} record={props.record} label="a" />
		<Tag id="b" loud={props.loud} record={props.record} label={props.record('between')} />
	</p>
}
function Press(props) @{
	if (props.loud) props.record('press');
	<button onClick={props.press}>{'press'}</button>
}
export function Panel(props) @{
	if (props.loud) props.record('panel');
	<section>
		<Press loud={props.loud} record={props.record} press={props.press} />
	</section>
}
function Remove(props) @{
	<button onClick={props.remove}>{'remove'}</button>
}
function Bubble(props) @{
	<main>
		@if (props.remove) {
			<div onClick={props.bubble}>
				<Remove remove={props.remove} />
			</div>
		}
	</main>
}
export function Removable(props) @{
	<section>
		<Bubble remove={props.remove} bubble={props.bubble} />
	</section>
}
function Card(props) @{
	<div>{props.children}</div>
}
function Author(props) @{
	<section>
		<button onClick={() => props.count$.set(props.count$.get() + 1)}>{'add'}</button>
		<Card>
			<output>{String(props.count$.get())}</output>
		</Card>
	</section>
}
export function Counter() @{
	const count$ = signal$(1);
	<Author count$={count$} />
}
function Hand(props) @{
	props.take(props.children);
	<i />
}
export function Lender(props) @{
	<Hand take={props.take}>
		<output>{String(props.value$.get())}</output>
	</Hand>
}
export function Outlet(props) @{
	<aside>
		@try {
			<div>{props.content}</div>
		} @catch (error) {
			<p>{props.caught(error) as string}</p>
		}
	</aside>
}
export function Source(props) @{
	const value$ = signal$(5);
	props.expose$(value$);
	<i />
}`;

describe.each([
	{ name: 'development', dev: true },
	{ name: 'production', dev: false },
])('deferred owner of a render that asks for none ($name)', ({ name, dev }) => {
	const quiet = () =>
		loadCompiledFixtureSource(QUIET, {
			id: `/src/quiet-owner-frame-${name}.tsrx`,
			mode: 'client',
			compileOptions: { dev, hmr: false },
			runtimeModules: { 'octane/signals': signals },
		});

	function mountRoot(): { host: HTMLElement; root: ReturnType<typeof createRoot> } {
		const host = container();
		const root = createRoot(host);
		cleanups.push(() => root.unmount());
		return { host, root };
	}

	it("evaluates a later sibling's props in the parent owner, not the earlier sibling's", () => {
		const { Siblings } = quiet();
		const log: Log = [];
		const record = (label: string) => mark(log, label);
		const ambient = currentSignalOwner();
		const { host, root } = mountRoot();
		root.render(Siblings, { loud: false, record });
		expect(host.textContent).toBe('a');
		expect(currentSignalOwner()).toBe(ambient);
		const between = ownerOf(log, 'between');
		expect(isRendererOwner(between)).toBe(true);

		// The owner each render reports once it asks is the one it had all along.
		log.length = 0;
		flushSync(() => root.render(Siblings, { loud: true, record }));
		expect(currentSignalOwner()).toBe(ambient);
		expect(ownerOf(log, 'siblings')).toBe(between);
		expect(ownerOf(log, 'between')).toBe(between);
		const tags = [ownerOf(log, 'tag a'), ownerOf(log, 'tag b')];
		expect(new Set([between, ...tags]).size).toBe(3);
	});

	it('runs a handler in the owner its component later renders in', () => {
		const { Panel } = quiet();
		const log: Log = [];
		const record = (label: string) => mark(log, label);
		const ambient = currentSignalOwner();
		const { host, root } = mountRoot();
		const press = () => log.push(['handler', currentSignalOwner()]);
		root.render(Panel, { loud: false, record, press });
		expect(log).toEqual([]);
		host.querySelector('button')!.click();
		const handler = ownerOf(log, 'handler');
		expect(isRendererOwner(handler)).toBe(true);
		expect(handler).not.toBe(ambient);

		flushSync(() => root.render(Panel, { loud: true, record, press }));
		expect(ownerOf(log, 'press')).toBe(handler);
		expect(ownerOf(log, 'panel')).not.toBe(handler);
		host.querySelector('button')!.click();
		expect(log.filter(([label]) => label === 'handler').map(([, owner]) => owner)).toEqual([
			handler,
			handler,
		]);
	});

	it('keeps a deleted tree retired for a queued handler reading a handle declared elsewhere', () => {
		const { Removable, Source } = quiet();
		let value$!: SignalHandle<number>;
		mountRoot().root.render(Source, {
			expose$: (handle$: SignalHandle<number>) => (value$ = handle$),
		});
		const { host, root } = mountRoot();
		const reads: unknown[] = [];
		root.render(Removable, {
			remove: () => root.unmount(),
			bubble() {
				try {
					reads.push(value$.get());
				} catch (error) {
					reads.push(error);
				}
			},
		});
		host.querySelector('button')!.click();
		expect(host.querySelector('main')).toBeNull();
		// The handler outlives its arm and the component the arm belongs to.
		// Neither asked for an owner while it lived, and neither gets a live one
		// now to hold a cell for the handle.
		expect(reads).toHaveLength(1);
		expect(reads[0]).toBeInstanceOf(ScopeDisposedError);
	});

	it("reads a handle prop in passed children from the cell its component's handler writes", () => {
		// A component that receives a handle owns a cell for it. Author asks for no
		// owner while it renders, yet its handler and the children it passes Card
		// must both reach that one cell.
		const { Counter } = quiet();
		const { host, root } = mountRoot();
		root.render(Counter);
		expect(host.querySelector('output')!.textContent).toBe('1');
		flushSync(() => host.querySelector('button')!.click());
		expect(host.querySelector('output')!.textContent).toBe('2');
	});

	it('keeps a deleted component retired for children it passed that render later', () => {
		const { Lender, Outlet, Source } = quiet();
		let value$!: SignalHandle<number>;
		mountRoot().root.render(Source, {
			expose$: (handle$: SignalHandle<number>) => (value$ = handle$),
		});
		let content: unknown;
		const lender = mountRoot();
		lender.root.render(Lender, { value$, take: (children: unknown) => (content = children) });
		lender.root.unmount();

		const errors: unknown[] = [];
		const { host, root } = mountRoot();
		root.render(Outlet, {
			content,
			caught(error: unknown) {
				errors.push(error);
				return 'retired';
			},
		});
		// The children belong to the deleted Lender's template, so the handle
		// resolves through its retired owner, not a live one minted for it.
		expect(host.textContent).toBe('retired');
		expect(errors[0]).toBeInstanceOf(ScopeDisposedError);
	});
});

// An effect or a cleanup runs in its component's owner too, and creates it only
// when it asks: a deleted component that never asked for one has none to
// retire. These components ask for none while they render until told to.
const EFFECTS = `import { useLayoutEffect } from 'octane';
import { signal$ } from 'octane/signals';
function Row(props) @{
	if (props.loud) props.record('row ' + props.id);
	useLayoutEffect(() => {
		props.record('effect ' + props.id);
		return () => props.record('cleanup ' + props.id);
	}, [props.tick]);
	<li>{props.id as string}</li>
}
export function Rows(props) @{
	if (props.loud) props.record('rows');
	<ul>
		@for (const id of props.ids; key id) {
			<Row id={id} loud={props.loud} tick={props.tick} record={props.record} />
		}
	</ul>
}
export function Local(props) @{
	const count$ = signal$(3);
	props.expose$?.(count$);
	useLayoutEffect(() => () => props.left?.(count$.get()), []);
	<output>{String(count$.get())}</output>
}`;

const total$ = signal$(0);

describe.each([
	{ name: 'development', dev: true },
	{ name: 'production', dev: false },
])('owner of an effect or cleanup ($name)', ({ name, dev }) => {
	const effects = () =>
		loadCompiledFixtureSource(EFFECTS, {
			id: `/src/effect-owner-frame-${name}.tsrx`,
			mode: 'client',
			compileOptions: { dev, hmr: false },
			runtimeModules: { 'octane/signals': signals },
		});

	// The document signal owner is what gives a root's components owners.
	function enableSignals(): void {
		const root = createRoot(container());
		cleanups.push(() => root.unmount());
		root.render(Leaf, { id: 'enable', log: [] });
	}

	it('runs effects and cleanups in the owner their component later renders in', () => {
		enableSignals();
		const { Rows } = effects();
		const log: Log = [];
		const record = (label: string) => mark(log, label);
		const ambient = currentSignalOwner();
		const root = createRoot(container());
		cleanups.push(() => root.unmount());
		flushSync(() => root.render(Rows, { ids: ['a', 'b'], loud: false, tick: 0, record }));
		flushSync(() => root.render(Rows, { ids: ['a', 'b'], loud: false, tick: 1, record }));
		// Row b is deleted by its parent's render.
		flushSync(() => root.render(Rows, { ids: ['a'], loud: false, tick: 1, record }));
		expect(currentSignalOwner()).toBe(ambient);
		const a = ownerOf(log, 'effect a');
		const b = ownerOf(log, 'effect b');
		expect(isRendererOwner(a)).toBe(true);
		expect(isRendererOwner(b)).toBe(true);
		expect(a).not.toBe(b);
		const owners = (label: string) =>
			log.filter(([entry]) => entry === label).map(([, owner]) => owner);
		expect(owners('effect a')).toEqual([a, a]);
		expect(owners('cleanup a')).toEqual([a]);
		expect(owners('effect b')).toEqual([b, b]);
		expect(owners('cleanup b')).toEqual([b, b]);

		log.length = 0;
		flushSync(() => root.render(Rows, { ids: ['a'], loud: true, tick: 2, record }));
		expect(ownerOf(log, 'row a')).toBe(a);
		expect(ownerOf(log, 'cleanup a')).toBe(a);
		expect(ownerOf(log, 'effect a')).toBe(a);
		expect(ownerOf(log, 'rows')).not.toBe(a);

		log.length = 0;
		root.unmount();
		expect(ownerOf(log, 'cleanup a')).toBe(a);
		expect(currentSignalOwner()).toBe(ambient);
	});

	it("writes a module signal from a cleanup into its root owner's cell", () => {
		enableSignals();
		const { Rows } = effects();
		const owner = createScope({ scopeKey: 'cleanup-owner-frame-' + name });
		const total = () => runWithSignalOwner(owner, () => total$.get());
		const before = total$.get();
		const props = {
			loud: false,
			tick: 0,
			record(label: string) {
				if (label.startsWith('cleanup')) total$.set(total$.get() + 1);
			},
		};
		const root = createRoot(container(), { signalOwner: owner });
		cleanups.push(() => root.unmount());
		flushSync(() => root.render(Rows, { ...props, ids: ['a', 'b', 'c'] }));
		expect(total()).toBe(0);
		flushSync(() => root.render(Rows, { ...props, ids: ['a', 'b'] }));
		expect(total()).toBe(1);
		// Outside any render, where no owner is current.
		root.unmount();
		expect(total()).toBe(3);
		expect(total$.get()).toBe(before);
	});

	it('restores the owner a cleanup interrupted', () => {
		enableSignals();
		const { Rows } = effects();
		const explicit = { scopeKey: 'cleanup-owner-frame-explicit' };
		const inner = createRoot(container());
		flushSync(() => inner.render(Rows, { ids: ['x'], loud: false, tick: 0, record: () => '' }));
		expect(
			runWithSignalOwner(explicit, () => {
				inner.unmount();
				return currentSignalOwner();
			}),
		).toBe(explicit);

		// An effect that deletes another tree keeps its own owner afterwards.
		// Neither component has asked for an owner before its callback does.
		const nested = createRoot(container());
		const seen: Log = [];
		flushSync(() =>
			nested.render(Rows, {
				ids: ['y'],
				loud: false,
				tick: 0,
				record: (label: string) => (label === 'cleanup y' ? mark(seen, label) : ''),
			}),
		);
		const log: Log = [];
		const record = (label: string) => {
			if (label === 'effect a' && log.length === 0) nested.unmount();
			return mark(log, label);
		};
		const root = createRoot(container());
		cleanups.push(() => root.unmount());
		flushSync(() => root.render(Rows, { ids: ['a'], loud: false, tick: 0, record }));
		const a = ownerOf(log, 'effect a');
		expect(isRendererOwner(a)).toBe(true);
		const y = ownerOf(seen, 'cleanup y');
		expect(isRendererOwner(y)).toBe(true);
		expect(a).not.toBe(y);
		flushSync(() => root.render(Rows, { ids: ['a'], loud: true, tick: 0, record }));
		expect(ownerOf(log, 'row a')).toBe(a);
	});

	it('retires the owner a cleanup of a deleted component asked for', () => {
		enableSignals();
		const { Rows, Local } = effects();
		let value$!: SignalHandle<number>;
		const source = createRoot(container());
		cleanups.push(() => source.unmount());
		source.render(Local, { expose$: (handle$: SignalHandle<number>) => (value$ = handle$) });
		const log: Log = [];
		const root = createRoot(container());
		flushSync(() =>
			root.render(Rows, {
				ids: ['a'],
				loud: false,
				tick: 0,
				record: (label: string) => (label === 'cleanup a' ? mark(log, label) : ''),
			}),
		);
		root.unmount();
		const owner = ownerOf(log, 'cleanup a')!;
		expect(isRendererOwner(owner)).toBe(true);
		expect(() => runWithSignalOwner(owner, () => value$.get())).toThrow(ScopeDisposedError);
	});

	it('reads a signal its component declared from a cleanup', () => {
		const { Local } = effects();
		const left: number[] = [];
		const host = container();
		const root = createRoot(host);
		flushSync(() => root.render(Local, { left: (value: number) => left.push(value) }));
		expect(host.textContent).toBe('3');
		root.unmount();
		expect(left).toEqual([3]);
	});
});
