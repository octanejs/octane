import { expect, it } from 'vitest';
import { flushSync } from 'octane';
import { renderToString } from 'octane/server';
import * as Signals from 'octane/signals';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const source = `import {signal$, derived$} from 'octane/signals';
function Child(props) @{
 const point$ = signal$({x: 0}, {watched: () => { props.events.push('start:' + props.label); return () => props.events.push('stop:' + props.label); }});
 const copy$ = derived$(() => ({x: point$.get().x}), {sync: true, watched: () => { props.events.push('derived:start:' + props.label); return () => props.events.push('derived:stop:' + props.label); }});
 const point = copy$.get();
 if (props.suspend) throw props.pending;
 <output>{String(point.x)}</output>
}
export function App(props) @{ <section>@try { <Child {...props}/> } @pending { <i>pending</i> }</section> }
export function Derived(props) @{
 const value$ = derived$(() => ({x: props.value}), {sync:true, equals:(a,b) => { props.compared.push(props.label); return a.x % 2 === b.x % 2; }});
 const value = value$.get(); props.capture(value);
 <output>{String(value.x)}</output>
}`;
const fixture = loadCompiledFixtureSource(source, {
	id: '/packages/octane/tests/_fixtures/authored-options.tsrx',
	mode: 'client',
	runtimeModules: { 'octane/signals': Signals },
});
const serverFixture = loadCompiledFixtureSource(source, {
	id: '/packages/octane/tests/_fixtures/authored-options.tsrx',
	mode: 'server',
	runtimeModules: { 'octane/signals': Signals },
});

it('does not start watched hooks for an unobserved server render', () => {
	const events: string[] = [];
	const html = renderToString(serverFixture.App, {
		events,
		pending: new Promise(() => {}),
		suspend: false,
		label: 'server',
	}).html;
	expect(html).toContain('0');
	expect(events).toEqual([]);
});

it('leaves an owner key reusable after invalid JS cell options', () => {
	const owner = { scopeKey: 'invalid-authored-options' };
	try {
		Signals.runWithSignalOwner(owner, () => {
			expect(() => Signals.signal$(0, { key: 'value', equals: 1 as never }).get()).toThrow(
				TypeError,
			);
			expect(Signals.signal$(1, { key: 'value' }).get()).toBe(1);
			expect(() =>
				Signals.derived$(() => 1, { key: 'computed', sync: true, watched: 1 as never }).get(),
			).toThrow(TypeError);
			expect(Signals.derived$(() => 2, { key: 'computed', sync: true }).get()).toBe(2);
		});
	} finally {
		Signals.retireSignalOwnerIdentity(owner);
	}
});

it('does not replace a first cell created reentrantly by an options getter', () => {
	const owner = { scopeKey: 'reentrant-authored-options' };
	try {
		Signals.runWithSignalOwner(owner, () => {
			const options: { key: string; equals?: (a: number, b: number) => boolean } = { key: 'value' };
			const resolveFirst$ = () => {
				Signals.signal$(0, { key: 'value' }).get();
				return () => true;
			};
			Object.defineProperty(options, 'equals', { get: resolveFirst$ });
			const value$ = Signals.signal$(1, options);
			expect(value$.get()).toBe(0);
			value$.set(2);
			expect(value$.get()).toBe(2);
		});
	} finally {
		Signals.retireSignalOwnerIdentity(owner);
	}
});

it('captures a derived comparator getter once and leaves a throwing getter’s key reusable', () => {
	const owner = { scopeKey: 'getter-authored-options' };
	let reads = 0;
	const options = new Proxy(
		{ key: 'copy', sync: true as const },
		{
			get(target, key, receiver) {
				if (key === 'equals') {
					if (++reads !== 1) throw new Error('equals read twice');
					return (a: { x: number }, b: { x: number }) => a.x === b.x;
				}
				return Reflect.get(target, key, receiver);
			},
		},
	);
	try {
		Signals.runWithSignalOwner(owner, () => {
			const source$ = Signals.signal$(0, { key: 'source' });
			const copy$ = Signals.derived$(() => ({ x: source$.get() % 2 }), options);
			const initial = copy$.get();
			source$.set(2);
			expect(copy$.get()).toBe(initial);
			expect(reads).toBe(1);
			const throwing = {
				key: 'failed',
				sync: true as const,
				get equals(): never {
					throw new Error('getter failed');
				},
			};
			expect(() => Signals.derived$(() => 1, throwing).get()).toThrow('getter failed');
			expect(Signals.derived$(() => 2, { key: 'failed', sync: true }).get()).toBe(2);
		});
	} finally {
		Signals.retireSignalOwnerIdentity(owner);
	}
});

it('captures a writable watched getter once before registering the cell', () => {
	const owner = { scopeKey: 'watched-getter-authored-options' };
	const events: string[] = [];
	let reads = 0;
	const options = {
		key: 'value',
		get watched() {
			if (++reads !== 1) throw new Error('watched read twice');
			return () => {
				events.push('start');
				return () => events.push('stop');
			};
		},
	};
	try {
		Signals.runWithSignalOwner(owner, () => {
			const value$ = Signals.signal$(1, options);
			const stop = value$.subscribe(() => {});
			stop();
			expect(reads).toBe(1);
			expect(events).toEqual(['start', 'stop']);
		});
	} finally {
		Signals.retireSignalOwnerIdentity(owner);
	}
});

it('starts watched only for an accepted observer and keeps the first cell owner’s closure', () => {
	const events: string[] = [];
	const pending = new Promise(() => {});
	const rendered = mount(fixture.App, { events, pending, suspend: true, label: 'discarded' });
	try {
		expect(rendered.container.textContent).toBe('pending');
		expect(events).toEqual([]);
		flushSync(() =>
			rendered.root.render(fixture.App, { events, pending, suspend: false, label: 'accepted' }),
		);
		expect(rendered.container.textContent).toBe('0');
		expect(events).toEqual(['start:accepted', 'derived:start:accepted']);
		flushSync(() =>
			rendered.root.render(fixture.App, { events, pending, suspend: false, label: 'later' }),
		);
		expect(events).toEqual(['start:accepted', 'derived:start:accepted']);
	} finally {
		rendered.unmount();
	}
	expect(events).toEqual([
		'start:accepted',
		'derived:start:accepted',
		'derived:stop:accepted',
		'stop:accepted',
	]);
});

it('retains an equal derived result and the first comparator across rerenders', () => {
	const compared: string[] = [];
	const values: { x: number }[] = [];
	const capture = (value: { x: number }) => values.push(value);
	const rendered = mount(fixture.Derived, { value: 0, label: 'first', compared, capture });
	try {
		const initial = values.at(-1);
		flushSync(() =>
			rendered.root.render(fixture.Derived, { value: 2, label: 'later', compared, capture }),
		);
		expect(values.at(-1)).toBe(initial);
		expect(rendered.container.textContent).toBe('0');
		flushSync(() =>
			rendered.root.render(fixture.Derived, { value: 3, label: 'last', compared, capture }),
		);
		expect(rendered.container.textContent).toBe('3');
		expect(compared.length).toBeGreaterThan(0);
		expect(compared.every((label) => label === 'first')).toBe(true);
	} finally {
		rendered.unmount();
	}
});
