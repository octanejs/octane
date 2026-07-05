/**
 * Conformance port of react-dom/src/__tests__/ReactBrowserEventEmitter-test.js
 * (React v19.2.7) — bubbling order, currentTarget, stopPropagation, and the
 * "registration state during a dispatch" rules, driven through octane's real
 * delegated native events.
 *
 * Scope note: octane has no synthetic event objects. React's snapshot-the-world
 * dispatch queue is a synthetic-layer construct; the DOM's own contract is that
 * an ancestor's listener list is read when the event REACHES that node, so
 * mid-dispatch mutations of ancestors DO take effect on the platform. The
 * faithful ports of :332/:346 (which schedule their re-render from the handler)
 * pass under both models; the sync-flush companions document octane's
 * platform-live semantics as an intentional divergence from React's snapshot.
 */
import { describe, it, expect } from 'vitest';
import { mount, createLog } from '../_helpers';
import { flushSync } from '../../src/index.js';
import { ClickTree } from './_fixtures/browser-event-emitter.tsrx';

describe('ReactBrowserEventEmitter — bubbling', () => {
	// Per ReactBrowserEventEmitter-test.js:134 — should bubble simply
	it('bubbles simply (child → parent → grandparent)', () => {
		const log = createLog();
		const r = mount(ClickTree, {
			onGrand: () => log.push('GRANDPARENT'),
			onParent: () => log.push('PARENT'),
			onChild: () => log.push('CHILD'),
		});
		(r.find('.child') as HTMLElement).click();
		expect(log.drain()).toEqual(['CHILD', 'PARENT', 'GRANDPARENT']);
		r.unmount();
	});

	// Per ReactBrowserEventEmitter-test.js:152 — should bubble to the right handler after an update
	it('bubbles to the right handler after an update', () => {
		const log = createLog();
		const onParent = () => log.push('PARENT');
		const onChild = () => log.push('CHILD');
		const r = mount(ClickTree, {
			onGrand: () => log.push('GRANDPARENT'),
			onParent,
			onChild,
		});
		(r.find('.child') as HTMLElement).click();
		expect(log.drain()).toEqual(['CHILD', 'PARENT', 'GRANDPARENT']);

		// Update just the grandparent without updating the child.
		r.update(ClickTree, {
			onGrand: () => log.push('UPDATED_GRANDPARENT'),
			onParent,
			onChild,
		});
		(r.find('.child') as HTMLElement).click();
		expect(log.drain()).toEqual(['CHILD', 'PARENT', 'UPDATED_GRANDPARENT']);
		r.unmount();
	});

	// Per ReactBrowserEventEmitter-test.js:181 — should continue bubbling if an
	// error is thrown. React (and the platform: each native listener invocation is
	// guarded — "report the exception and continue") fires the remaining ancestor
	// handlers and surfaces the error globally.
	//
	// GAP: octane's `dispatchDelegated` walk (runtime.ts:4259) invokes handler
	// slots unguarded — the parent's throw propagates out of the walk, so the
	// grandparent's handler never fires (octane logs ['CHILD','PARENT'], React
	// ['CHILD','PARENT','GRANDPARENT']). The error IS surfaced as an uncaught
	// window error in both. Fix would guard each fireEventSlot call, reporting
	// the exception and continuing the walk.
	it('continues bubbling to the grandparent if a handler throws', () => {
		const log = createLog();
		const seen: string[] = [];
		const onErr = (e: ErrorEvent) => {
			seen.push(String(e.message));
			e.preventDefault(); // keep the expected uncaught error out of the test runner
		};
		window.addEventListener('error', onErr);
		const r = mount(ClickTree, {
			onGrand: () => log.push('GRANDPARENT'),
			onParent: () => {
				log.push('PARENT');
				throw new Error('Handler interrupted');
			},
			onChild: () => log.push('CHILD'),
		});
		try {
			(r.find('.child') as HTMLElement).click();
			expect(log.drain()).toEqual(['CHILD', 'PARENT', 'GRANDPARENT']);
			expect(seen).toEqual(['Handler interrupted']);
		} finally {
			window.removeEventListener('error', onErr);
			r.unmount();
		}
	});

	// Per ReactBrowserEventEmitter-test.js:215 — should set currentTarget
	it('sets currentTarget to the handler’s own element at each bubble step', () => {
		const log = createLog();
		const r = mount(ClickTree, {
			onGrand: (e: Event) => {
				log.push('GRANDPARENT');
				expect(e.currentTarget).toBe(r.find('.grand'));
			},
			onParent: (e: Event) => {
				log.push('PARENT');
				expect(e.currentTarget).toBe(r.find('.parent'));
			},
			onChild: (e: Event) => {
				log.push('CHILD');
				expect(e.currentTarget).toBe(r.find('.child'));
			},
		});
		(r.find('.child') as HTMLElement).click();
		expect(log.drain()).toEqual(['CHILD', 'PARENT', 'GRANDPARENT']);
		r.unmount();
	});
});

describe('ReactBrowserEventEmitter — stopPropagation', () => {
	// Per ReactBrowserEventEmitter-test.js:238 — should support stopPropagation()
	it('supports stopPropagation() at a middle handler', () => {
		const log = createLog();
		const r = mount(ClickTree, {
			onGrand: () => log.push('GRANDPARENT'),
			onParent: (e: Event) => {
				log.push('PARENT');
				e.stopPropagation();
			},
			onChild: () => log.push('CHILD'),
		});
		(r.find('.child') as HTMLElement).click();
		expect(log.drain()).toEqual(['CHILD', 'PARENT']);
		r.unmount();
	});

	// Per ReactBrowserEventEmitter-test.js:281 — should stop after first dispatch if stopPropagation
	it('stops after the first handler if it calls stopPropagation()', () => {
		const log = createLog();
		const r = mount(ClickTree, {
			onGrand: () => log.push('GRANDPARENT'),
			onParent: () => log.push('PARENT'),
			onChild: (e: Event) => {
				log.push('CHILD');
				e.stopPropagation();
			},
		});
		(r.find('.child') as HTMLElement).click();
		expect(log.drain()).toEqual(['CHILD']);
		r.unmount();
	});

	// Per ReactBrowserEventEmitter-test.js:301 — should not stopPropagation if false is returned
	it('does not stop propagation when a handler returns false', () => {
		const log = createLog();
		const r = mount(ClickTree, {
			onGrand: () => log.push('GRANDPARENT'),
			onParent: () => log.push('PARENT'),
			onChild: () => {
				log.push('CHILD');
				return false;
			},
		});
		(r.find('.child') as HTMLElement).click();
		expect(log.drain()).toEqual(['CHILD', 'PARENT', 'GRANDPARENT']);
		r.unmount();
	});
});

describe('ReactBrowserEventEmitter — handler mutation during a dispatch', () => {
	// Per ReactBrowserEventEmitter-test.js:332 — should invoke handlers that were
	// removed while bubbling. Faithful port: the child handler SCHEDULES a
	// re-render that deletes the parent's listener (React's test awaits it);
	// the in-flight dispatch still invokes the parent's handler because the
	// removal has not committed when the event reaches it.
	it('invokes a parent handler whose removal was scheduled by the child handler', () => {
		const log = createLog();
		let parentClicks = 0;
		const r = mount(ClickTree, {
			onParent: () => parentClicks++,
			onChild: () => {
				log.push('CHILD');
				// Scheduled (not flushed) — commits after the dispatch completes.
				r.root.render(ClickTree, { onParent: undefined, onChild: () => log.push('CHILD2') });
			},
		});
		(r.find('.child') as HTMLElement).click();
		expect(parentClicks).toBe(1);
		// The removal DID commit after the event: a second click reaches nobody's
		// parent handler.
		(r.find('.child') as HTMLElement).click();
		expect(parentClicks).toBe(1);
		r.unmount();
	});

	// Per ReactBrowserEventEmitter-test.js:346 — should not invoke newly inserted
	// handlers while bubbling. Faithful port: the child handler SCHEDULES a
	// re-render that adds a parent listener; the current dispatch must not see it.
	it('does not invoke a parent handler whose insertion was scheduled by the child handler', () => {
		let parentClicks = 0;
		const parentHandler = () => parentClicks++;
		const r = mount(ClickTree, {
			onParent: undefined,
			onChild: () => {
				r.root.render(ClickTree, { onParent: parentHandler, onChild: () => {} });
			},
		});
		(r.find('.child') as HTMLElement).click();
		expect(parentClicks).toBe(0);
		// After the event the insertion has committed — the next click reaches it.
		(r.find('.child') as HTMLElement).click();
		expect(parentClicks).toBe(1);
		r.unmount();
	});

	// Companion to :332 — intentional divergence (synthetic snapshot): if the
	// child handler FORCES the removal to commit mid-dispatch (flushSync), React's
	// snapshot would still invoke the parent's listener, but the DOM's own
	// contract reads each node's listeners when the event reaches it — a listener
	// removed before the event arrives does not fire. octane's live `$$click`
	// slot walk matches the platform.
	it('flushSync removal mid-dispatch takes effect for the rest of the walk (platform-live semantics)', () => {
		let parentClicks = 0;
		const r = mount(ClickTree, {
			onParent: () => parentClicks++,
			onChild: () => {
				flushSync(() => r.root.render(ClickTree, { onParent: undefined, onChild: () => {} }));
			},
		});
		(r.find('.child') as HTMLElement).click();
		expect(parentClicks).toBe(0);
		r.unmount();
	});

	// Companion to :346 — intentional divergence (synthetic snapshot): a listener
	// ADDED to an ancestor before the event reaches it DOES fire on the platform
	// (and in octane's live walk); React's snapshot would exclude it.
	it('flushSync insertion mid-dispatch fires for the rest of the walk (platform-live semantics)', () => {
		let parentClicks = 0;
		const parentHandler = () => parentClicks++;
		const r = mount(ClickTree, {
			onParent: undefined,
			onChild: () => {
				flushSync(() => r.root.render(ClickTree, { onParent: parentHandler, onChild: () => {} }));
			},
		});
		(r.find('.child') as HTMLElement).click();
		expect(parentClicks).toBe(1);
		r.unmount();
	});
});

/**
 * Cases from ReactBrowserEventEmitter-test.js NOT ported (out of scope):
 *
 * - :259 "should support overriding .isPropagationStopped()" — mutates the
 *   SYNTHETIC event object's isPropagationStopped method to halt React's
 *   dispatch loop without touching the native event. octane dispatches the real
 *   native Event; there is no synthetic wrapper or isPropagationStopped API to
 *   override (synthetic event-system internals, per plan §2).
 */
