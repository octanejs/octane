/**
 * Host-element ref lifecycle — ported from facebook/react
 * packages/react-dom/src/__tests__/refs-test.js (React 19.2.7).
 *
 * In scope here:
 *   - ref "hopping" between stable host elements (:62) — detach-before-attach
 *     ordering when a ref's binding expression moves to a different element.
 *   - root-level host refs attach/detach across root unmount (:176; the host
 *     and multi-node-root segments — the `<Comp ref>` class-instance segments
 *     are N/A, octane has no component instances).
 *   - stable callback identity through a child component (:121).
 *   - React-19 callback-ref cleanup functions (:274, :346, :379, :443).
 *   - useImperativeHandle object/callback/cleanup refs (:491, :506, :528).
 *
 * Out of scope:
 *   - :105 'always has a value for this.refs' — class/string refs.
 *   - :150 'provides an error for invalid refs' — error-surface specifics
 *     (React throws an AggregateError from the commit; octane does not
 *     type-validate ref shapes).
 */
import { describe, it, expect } from 'vitest';
import { mount, act, flushEffects } from '../_helpers';
import { flushSync } from '../../src/index.js';
import {
	RefHopsAround,
	HostRoot,
	FragmentRoot,
	HostWithRef,
	StableOuter,
	ImperativeGate,
} from './_fixtures/refs.tsrx';

type Ref = { current: Element | null };
const ref = (): Ref => ({ current: null });

describe('ref swapping', () => {
	it('allows refs to hop around children correctly', () => {
		// Per refs-test.js:62 — a single moving cursor ref `hop` walks across
		// three persistent divs; each step must detach it from the previous div,
		// attach it to the next, and restore the displaced stationary ref.
		const container = ref();
		const hop = ref();
		const one = ref();
		const two = ref();
		const three = ref();
		const refs = { container, hop, one, two, three };
		const m = mount(RefHopsAround as any, { count: 0, ...refs });

		const firstDiv = container.current!.querySelector('.first');
		const secondDiv = container.current!.querySelector('.second');
		const thirdDiv = container.current!.querySelector('.third');

		expect(hop.current).toBe(firstDiv);
		expect(two.current).toBe(secondDiv);
		expect(three.current).toBe(thirdDiv);

		m.root.render(RefHopsAround as any, { count: 1, ...refs });
		flushSync(() => {});
		expect(one.current).toBe(firstDiv);
		expect(hop.current).toBe(secondDiv);
		expect(three.current).toBe(thirdDiv);

		m.root.render(RefHopsAround as any, { count: 2, ...refs });
		flushSync(() => {});
		expect(one.current).toBe(firstDiv);
		expect(two.current).toBe(secondDiv);
		expect(hop.current).toBe(thirdDiv);

		// Per refs-test.js:96 — after the third hop we're back where we started
		// and the refs are completely restored.
		m.root.render(RefHopsAround as any, { count: 3, ...refs });
		flushSync(() => {});
		expect(hop.current).toBe(firstDiv);
		expect(two.current).toBe(secondDiv);
		expect(three.current).toBe(thirdDiv);
		m.unmount();
	});

	it('calls a stable ref exactly once through a child component re-render', () => {
		// Per refs-test.js:121 — a stable callback ref forwarded to a child's
		// host element fires once, even though the parent re-renders after mount.
		let refCalled = 0;
		const saveA = (el: Element | null) => {
			if (el !== null) refCalled++;
		};
		const m = mount(StableOuter as any, { saveA });
		flushEffects(); // run the post-mount effect that re-renders the parent
		flushSync(() => {});
		expect(refCalled).toBe(1);
		m.unmount();
	});
});

describe('root level refs', () => {
	it('attaches and detaches a host root ref across unmount', () => {
		// Per refs-test.js:176 (host-node segment) — ref fires with the element
		// on mount and with null on root unmount.
		const calls: (Element | null)[] = [];
		const m = mount(HostRoot as any, { r: (el: Element | null) => calls.push(el) });
		expect(calls.length).toBe(1);
		expect(calls[0]).toBeInstanceOf(HTMLDivElement);
		expect(calls[0]).toBe(m.container.firstChild);

		m.unmount();
		expect(calls.length).toBe(2);
		expect(calls[1]).toBe(null);
	});

	it('attaches and detaches refs on a multi-node root', () => {
		// Per refs-test.js:225 (fragment segment) — a ref'd div inside a
		// multi-node root cycles element → null across root unmount.
		const calls: (Element | null)[] = [];
		const m = mount(FragmentRoot as any, { r: (el: Element | null) => calls.push(el) });
		expect(calls.length).toBe(1);
		expect((calls[0] as Element).id).toBe('frag-div');

		m.unmount();
		expect(calls.length).toBe(2);
		expect(calls[1]).toBe(null);
	});
});

describe('refs return clean up function', () => {
	it('calls clean up function if it exists', () => {
		// Per refs-test.js:274 — a fresh inline callback each render: identity
		// change runs the previous ref's returned cleanup (with no argument)
		// instead of calling it with null; a ref WITHOUT a cleanup gets null.
		let setupCalls: (Element | null)[] = [];
		let cleanupCalls: unknown[] = [];

		const m = mount(HostWithRef as any, {
			r: (el: Element | null) => {
				setupCalls.push(el);
				return (arg?: unknown) => cleanupCalls.push(arg);
			},
		});
		expect(setupCalls.length).toBe(1);
		expect(cleanupCalls.length).toBe(0);

		// New identity, no cleanup return → old ref's cleanup runs (arg undefined).
		m.root.render(HostWithRef as any, {
			r: (el: Element | null) => {
				setupCalls.push(el);
			},
		});
		flushSync(() => {});
		expect(setupCalls.length).toBe(2);
		expect(cleanupCalls.length).toBe(1);
		expect(cleanupCalls[0]).toBe(undefined);

		// New (no-op) identity → the previous no-cleanup ref detaches via ref(null),
		// pushing the null onto ITS log (React: setup.mock.calls[2][0] === null).
		m.root.render(HostWithRef as any, { r: (_el: Element | null) => {} });
		flushSync(() => {});
		expect(cleanupCalls.length).toBe(1);
		expect(setupCalls.length).toBe(3);
		expect(setupCalls[2]).toBe(null);

		// Per refs-test.js:314 — fresh counters: attach a cleanup ref, then swap
		// to another cleanup ref; exactly one cleanup fires.
		setupCalls = [];
		cleanupCalls = [];
		m.root.render(HostWithRef as any, {
			r: (el: Element | null) => {
				setupCalls.push(el);
				return () => cleanupCalls.push('a');
			},
		});
		flushSync(() => {});
		expect(setupCalls.length).toBe(1);
		expect(cleanupCalls.length).toBe(0);

		m.root.render(HostWithRef as any, {
			r: (el: Element | null) => {
				setupCalls.push(el);
				return () => cleanupCalls.push('b');
			},
		});
		flushSync(() => {});
		expect(setupCalls.length).toBe(2);
		expect(cleanupCalls.length).toBe(1);
		m.unmount();
	});

	it('handles ref functions with stable identity', () => {
		// Per refs-test.js:346 — a stable callback is NOT re-invoked when other
		// props change; removing it runs its cleanup exactly once.
		let setup = 0;
		let cleanup = 0;
		const stable = (_el: Element | null) => {
			setup++;
			return () => cleanup++;
		};
		const m = mount(HostWithRef as any, { r: stable, id: 'a' });
		expect(setup).toBe(1);
		expect(cleanup).toBe(0);

		m.root.render(HostWithRef as any, { r: stable, id: 'niceClassName' });
		flushSync(() => {});
		expect(setup).toBe(1);
		expect(cleanup).toBe(0);

		m.root.render(HostWithRef as any, { r: undefined, id: 'a' });
		flushSync(() => {});
		expect(setup).toBe(1);
		expect(cleanup).toBe(1);
		m.unmount();
	});

	it('handles detaching refs with either cleanup function or null argument', () => {
		// Per refs-test.js:379 — a ref that returns a cleanup detaches through
		// the cleanup (never a null call); a ref that doesn't gets the null call.
		let setup = 0;
		let setup2 = 0;
		let cleanUp = 0;
		let nullHandler = 0;
		let seenId = '';
		let seenId2 = '';

		const withCleanup = (el: Element | null) => {
			if (el) {
				setup++;
				seenId = el.id;
			} else {
				nullHandler++;
			}
			return () => cleanUp++;
		};
		const withoutCleanup = (el: Element | null) => {
			if (el) {
				setup2++;
				seenId2 = el.id;
			} else {
				nullHandler++;
			}
		};

		const m = mount(HostWithRef as any, { r: withCleanup, id: 'test-div' });
		expect(seenId).toBe('test-div');
		expect(setup).toBe(1);
		expect(cleanUp).toBe(0);

		m.root.render(HostWithRef as any, { r: withoutCleanup, id: 'test-div2' });
		flushSync(() => {});
		expect(setup).toBe(1); // existing setup not called again
		expect(nullHandler).toBe(0); // no null call — cleanup was returned
		expect(cleanUp).toBe(1);
		expect(setup2).toBe(1);
		expect(seenId2).toBe('test-div2');

		m.root.render(HostWithRef as any, { r: withCleanup, id: 'test-div3' });
		flushSync(() => {});
		expect(setup2).toBe(1);
		expect(nullHandler).toBe(1); // no-cleanup ref detached via null
		expect(setup).toBe(2);
		m.unmount();
	});

	it('calls cleanup function on unmount', () => {
		// Per refs-test.js:443 — unmounting runs the returned cleanup; the ref
		// callback is never called with null when a cleanup was returned.
		let setup = 0;
		let cleanUp = 0;
		let nullHandler = 0;
		const m = mount(HostWithRef as any, {
			id: 'test-div',
			r: (el: Element | null) => {
				if (el) setup++;
				else nullHandler++;
				return () => cleanUp++;
			},
		});
		expect(setup).toBe(1);
		expect(cleanUp).toBe(0);
		expect(nullHandler).toBe(0);

		m.unmount();
		expect(setup).toBe(1);
		expect(cleanUp).toBe(1);
		expect(nullHandler).toBe(0);
	});
});

describe('useImperativeHandle refs', () => {
	it('should work with object style refs', async () => {
		// Per refs-test.js:491.
		const r: { current: any } = { current: null };
		const m = mount(ImperativeGate as any, { show: true, name: 'Alice', r });
		await act(async () => {});
		expect(r.current.greet()).toBe('Hello Alice');

		m.root.render(ImperativeGate as any, { show: false, name: 'Alice', r });
		flushSync(() => {});
		expect(r.current).toBe(null);
		m.unmount();
	});

	it('should work with callback style refs', async () => {
		// Per refs-test.js:506.
		let current: any = null;
		const cb = (h: any) => {
			current = h;
		};
		const m = mount(ImperativeGate as any, { show: true, name: 'Alice', r: cb });
		await act(async () => {});
		expect(current.greet()).toBe('Hello Alice');

		m.root.render(ImperativeGate as any, { show: false, name: 'Alice', r: cb });
		flushSync(() => {});
		expect(current).toBe(null);
		m.unmount();
	});

	it('should work with callback style refs with cleanup function', async () => {
		// Per refs-test.js:528 — a dep change re-creates the handle (cleanup then
		// re-attach); unmount runs the final cleanup.
		let cleanupCalls = 0;
		let createCalls = 0;
		let current: any = null;
		const cb = (h: any) => {
			current = h;
			createCalls++;
			return () => {
				current = null;
				cleanupCalls++;
			};
		};

		const m = mount(ImperativeGate as any, { show: true, name: 'Alice', r: cb });
		await act(async () => {});
		expect(current.greet()).toBe('Hello Alice');
		expect(createCalls).toBe(1);
		expect(cleanupCalls).toBe(0);

		m.root.render(ImperativeGate as any, { show: true, name: 'Bob', r: cb });
		await act(async () => {});
		expect(current.greet()).toBe('Hello Bob');
		expect(createCalls).toBe(2);
		expect(cleanupCalls).toBe(1);

		m.root.render(ImperativeGate as any, { show: false, name: 'Bob', r: cb });
		await act(async () => {});
		expect(current).toBe(null);
		expect(createCalls).toBe(2);
		expect(cleanupCalls).toBe(2);
		m.unmount();
	});
});
