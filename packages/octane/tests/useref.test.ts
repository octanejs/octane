import { describe, it, expect, vi } from 'vitest';
import { mount, nextPaint } from './_helpers';
import { createRoot, flushSync, hydrateRoot } from '../src/index.js';
import { renderToString } from 'octane/server';
import { loadServerFixture } from './_server-fixture.js';
import {
	PersistsAcrossRenders,
	MutationDoesNotRerender,
	StableIdentity,
	RefInIf,
	PerRowRef,
	DomRefObject,
	DomRefCallback,
	DomRefCleanup,
	DomRefObjectCleanup,
	ImperativeOwner,
	ImperativeValue,
	LazyInit,
} from './_fixtures/useref.tsrx';
import { ArrayRefsOneEl } from './_fixtures/useref-multi.tsrx';

describe('useRef — mutation API', () => {
	it('persists ref.current across renders', () => {
		const r = mount(PersistsAcrossRenders);
		expect(r.find('.value').textContent).toBe('0');
		r.click('#bump');
		r.click('#bump');
		r.click('#bump');
		expect(r.find('.value').textContent).toBe('3');
		r.unmount();
	});

	it('mutating ref.current does not trigger a render', () => {
		const handle: any = {};
		const r = mount(MutationDoesNotRerender, { tick: 1, bumpHandle: handle });
		expect(r.find('.count').textContent).toBe('1');
		expect(handle.read()).toBe(0);

		// Mutate ref off-render — DOM does not update.
		handle.bump();
		handle.bump();
		handle.bump();
		expect(r.find('.count').textContent).toBe('1');
		expect(handle.read()).toBe(3);

		// Force a re-render via prop change — ref still has value 3.
		r.update(MutationDoesNotRerender, { tick: 2, bumpHandle: handle });
		expect(r.find('.count').textContent).toBe('2');
		expect(handle.read()).toBe(3);
		r.unmount();
	});

	it('returns the same ref object identity across renders', () => {
		const observe = vi.fn();
		const r = mount(StableIdentity, { observe });
		const first = observe.mock.calls[0][0];
		r.click('button');
		r.click('button');
		for (const c of observe.mock.calls) expect(c[0]).toBe(first);
		expect(first.current).toEqual({ data: 'inner' });
		r.unmount();
	});

	it('keeps the FIRST value across renders even when input changes', () => {
		// useRef is not lazy (React parity) — `factory()` evaluates each render —
		// but the ref's .current stays at whatever it was first set to.
		let seq = 0;
		const factory = vi.fn(() => ({ token: ++seq }));
		const r = mount(LazyInit, { factory });
		const first = factory.mock.results[0].value;
		r.click('button');
		r.click('button');
		// factory was called each render, but ref.current didn't change.
		expect(factory.mock.calls.length).toBeGreaterThan(1);
		expect(r.find('button').textContent).toContain(String(first));
		r.unmount();
	});
});

describe('useRef — boundary semantics', () => {
	it('ref inside an if-branch resets when the branch remounts', () => {
		const r = mount(RefInIf);
		expect(r.find('#inner').textContent).toBe('0');
		r.click('#inner');
		r.click('#inner');
		r.click('#inner');
		expect(r.find('#inner').textContent).toBe('3');
		r.click('#top'); // hide → branch unmount
		expect(r.findAll('#inner')).toHaveLength(0);
		r.click('#top'); // show → fresh slot
		expect(r.find('#inner').textContent).toBe('0');
		r.unmount();
	});

	it('each for-of item has its own ref slot, surviving reorders', () => {
		const r = mount(PerRowRef);
		// Bump each row a different number of times.
		r.click('.r-1 button');
		r.click('.r-1 button'); // a → 2
		r.click('.r-2 button'); // b → 1
		r.click('.r-3 button');
		r.click('.r-3 button');
		r.click('.r-3 button'); // c → 3
		expect(r.findAll('li button').map((b) => b.textContent)).toEqual(['a:2', 'b:1', 'c:3']);
		// Reverse — refs follow their keys.
		r.click('#reverse');
		expect(r.findAll('li button').map((b) => b.textContent)).toEqual(['c:3', 'b:1', 'a:2']);
		r.unmount();
	});
});

describe('useRef — DOM ref attribute', () => {
	it('object ref captures the mounted element', async () => {
		const target: any = {};
		const r = mount(DomRefObject, { target });
		// After commit, the effect ran and copied ref.current into target.received.
		await nextPaint();
		const el = target.received;
		expect(el).not.toBe(null);
		expect(el.tagName).toBe('DIV');
		expect(el.id).toBe('unique-id');
		expect(el.className).toBe('target');
		r.unmount();
	});

	it('callback ref is invoked with the mounted element', () => {
		const target: any = {};
		mount(DomRefCallback, { target });
		expect(target.received).not.toBe(null);
		expect(target.received.tagName).toBe('DIV');
		expect(target.received.className).toBe('callback-target');
	});

	it('array-valued ref={[a, b]} attaches both refs to the same element', async () => {
		const target: any = {};
		mount(ArrayRefsOneEl, { target });
		await nextPaint();
		expect(target.a).not.toBe(null);
		expect(target.b).not.toBe(null);
		expect(target.a).toBe(target.b); // both refer to the same element
		expect(target.a.className).toBe('multi');
	});

	it('callback ref is invoked with the element on mount, then with null on unmount', () => {
		const calls: Array<Element | null> = [];
		const r = mount(DomRefCleanup, { observe: (el: Element | null) => calls.push(el) });
		expect(calls).toHaveLength(1);
		expect(calls[0]).not.toBe(null);
		r.click('#toggle'); // hide → element unmounts
		expect(calls).toHaveLength(2);
		expect(calls[1]).toBe(null);
		r.click('#toggle'); // show → fresh element
		expect(calls).toHaveLength(3);
		expect(calls[2]).not.toBe(null);
		expect(calls[2]).not.toBe(calls[0]); // new element instance
		r.unmount();
		expect(calls).toHaveLength(4);
		expect(calls[3]).toBe(null); // cleared on root unmount too
	});

	it('object ref .current is set to null when host element unmounts', () => {
		const objRef: { current: Element | null } = { current: null };
		const r = mount(DomRefObjectCleanup, { ref: objRef });
		expect(objRef.current).not.toBe(null);
		expect(objRef.current!.className).toBe('obj-target');
		r.click('#toggle'); // hide
		expect(objRef.current).toBe(null);
		r.click('#toggle'); // show again
		expect(objRef.current).not.toBe(null);
		r.unmount();
		expect(objRef.current).toBe(null);
	});
});

describe('useImperativeHandle', () => {
	it('shares one handle across nested refs and detaches the previous owners before a ref swap', () => {
		type Handle = { bump(): void; reset(): void };
		const objectRef: { current: Handle | null } = { current: null };
		const calls: Array<Handle | null | string> = [];
		const legacyRef = (value: Handle | null) => {
			calls.push(value);
		};
		const cleanupRef = (value: Handle | null) => {
			calls.push(value);
			return () => {
				calls.push('cleanup');
			};
		};
		const refs = Object.freeze([
			objectRef,
			Object.freeze([null, legacyRef, undefined, cleanupRef]),
		]);
		const r = mount(ImperativeOwner, { handle: refs });
		const handle = objectRef.current!;
		expect(calls).toEqual([handle, handle]);
		flushSync(() => handle.bump());
		expect(r.find('.counter').textContent).toBe('1');

		const nextRef = (value: Handle | null) => {
			calls.push(value === null ? 'next null' : 'next');
		};
		r.update(ImperativeOwner, { handle: [nextRef] });
		expect(objectRef.current).toBeNull();
		expect(calls).toEqual([handle, handle, null, 'cleanup', 'next']);
		r.unmount();
		expect(calls.at(-1)).toBe('next null');
	});

	it('supports primitive handles and skips factories for nullish or empty ref arrays', () => {
		const factory = vi.fn(() => 42);
		const objectRef: { current: number | null } = { current: null };
		const callback = vi.fn();
		const r = mount(ImperativeValue, { handle: [null, [undefined, []]], factory, label: 'empty' });
		expect(factory).not.toHaveBeenCalled();
		r.update(ImperativeValue, { handle: [objectRef, callback], factory, label: 'attached' });
		expect(factory).toHaveBeenCalledTimes(1);
		expect(objectRef.current).toBe(42);
		expect(callback).toHaveBeenCalledWith(42);
		r.unmount();
		expect(objectRef.current).toBeNull();
		expect(callback).toHaveBeenLastCalledWith(null);
	});

	it('detaches the attached owners after a caller mutates a ref array in place', () => {
		const calls: Array<number | null> = [];
		const original = (value: number | null) => {
			calls.push(value);
		};
		const replacement = vi.fn();
		const refs = [original];
		const factory = vi.fn(() => 42);
		const r = mount(ImperativeValue, { handle: refs, factory, label: 'original' });
		expect(calls).toEqual([42]);

		refs[0] = replacement;
		r.update(ImperativeValue, { handle: refs, factory, label: 'mutated' });
		expect(factory).toHaveBeenCalledTimes(1);
		expect(replacement).not.toHaveBeenCalled();
		r.unmount();
		expect(calls).toEqual([42, null]);
		expect(replacement).not.toHaveBeenCalled();
	});

	it.each(['attach', 'detach'] as const)(
		'releases other array owners when a callback throws on %s',
		(phase) => {
			const failure = new Error(`ref ${phase}`);
			const objectRef: { current: number | null } = { current: null };
			const errors: unknown[] = [];
			const container = document.createElement('div');
			document.body.appendChild(container);
			const root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
			const throwingRef = () => {
				if (phase === 'attach') throw failure;
				return () => {
					throw failure;
				};
			};
			const handle = phase === 'attach' ? [objectRef, throwingRef] : [throwingRef, objectRef];
			try {
				root.render(ImperativeValue, { handle, factory: () => 7, label: phase });
				flushSync(() => {});
				if (phase === 'detach') expect(objectRef.current).toBe(7);
				root.unmount();
				expect(objectRef.current).toBeNull();
				expect(errors).toEqual([failure]);
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);

	it('leaves refs untouched during SSR and attaches them when hydrating the server markup', () => {
		const server = loadServerFixture('packages/octane/tests/_fixtures/useref.tsrx');
		const objectRef: { current: number | null } = { current: null };
		const callback = vi.fn();
		const factory = vi.fn(() => 19);
		const props = { handle: [objectRef, [callback]], factory, label: 'hydrated' };
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = renderToString(server.ImperativeValue, props).html;
		expect(objectRef.current).toBeNull();
		expect(factory).not.toHaveBeenCalled();
		expect(callback).not.toHaveBeenCalled();
		const span = container.querySelector('span');
		const root = hydrateRoot(container, ImperativeValue, props);
		try {
			flushSync(() => {});
			expect(container.querySelector('span')).toBe(span);
			expect(objectRef.current).toBe(19);
			expect(callback).toHaveBeenCalledWith(19);
		} finally {
			root.unmount();
			container.remove();
		}
		expect(objectRef.current).toBeNull();
		expect(callback).toHaveBeenLastCalledWith(null);
	});

	it('child exposes an imperative API via the ref the parent passes in', async () => {
		const handle: { current: any } = { current: null };
		const r = mount(ImperativeOwner, { handle });
		await nextPaint(); // layout effect commits
		expect(handle.current).not.toBe(null);
		expect(typeof handle.current.bump).toBe('function');
		expect(typeof handle.current.reset).toBe('function');
		expect(r.find('.counter').textContent).toBe('0');
		// Use the imperative API from outside — flushSync to drain the resulting
		// render synchronously so we can assert on the DOM.
		flushSync(() => {
			handle.current.bump();
			handle.current.bump();
			handle.current.bump();
		});
		expect(r.find('.counter').textContent).toBe('3');
		flushSync(() => handle.current.reset());
		expect(r.find('.counter').textContent).toBe('0');
		r.unmount();
		expect(handle.current).toBe(null); // cleared on unmount
	});
});
