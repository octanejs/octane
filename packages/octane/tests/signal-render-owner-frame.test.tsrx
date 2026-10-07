import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, flushSync, startTransition, use } from 'octane';
import * as signals from 'octane/signals';
import {
	currentSignalOwner,
	installSignalOwnerEnvironment,
	runWithSignalOwner,
	signal$,
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
