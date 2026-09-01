/**
 * Conformance port of react-dom/src/__tests__/ReactDOMEventListener-test.js
 * (React v19.2.7) — event delegation with REAL native DOM events.
 *
 * Scope notes (per docs/react-parity-migration-plan.md §2): octane does not
 * expose React's SyntheticEvent API or event polyfills. It does reproduce the
 * user-visible propagation of native non-bubbling events (toggle/cancel/close,
 * media, load/error) by capture-delegating them through the logical tree.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { mount, createLog, type EffectLog } from '../_helpers';
import { loadServerFixture } from '../_server-fixture';
import * as ClientRT from '../../src/index.js';
import { createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import {
	RootDiv,
	PropagationTree,
	DeferredPortalEvents,
	DisappearingButton,
	BatchChild,
	BatchParent,
	SingleTreeDedup,
	FormEvents,
	MediaLoadTargets,
	NonBubblingPairs,
	AncestorOnlyHandlers,
	InvalidForm,
	PlayCaptureTree,
	ScrollTreeFull,
	ScrollTreeNoChild,
	ScrollSubscribe,
} from './_fixtures/event-listener.tsrx';

const outLogger = (log: EffectLog) => (e: Event) =>
	log.push('out:' + (e.currentTarget as Element).className);

describe('portal events after descendant updates', () => {
	// Lifecycle extension of React's logical portal propagation, not an exact
	// upstream test port: a child can reveal its first host without rerendering
	// the component that created the portal. Its events still belong to that tree.
	// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/DOMPluginEventSystem.js#L630
	it.each(['separate container', 'another root'] as const)(
		'delivers both portal phases after child-local state reveals content in %s',
		(placement) => {
			const log: string[] = [];
			const physicalRoot =
				placement === 'another root'
					? mount(PropagationTree, {
							onParentCapture: () => log.push('physical capture'),
							onParent: () => log.push('physical bubble'),
						})
					: null;
			const target = document.createElement('div');
			(physicalRoot?.find('.propagation-parent') ?? document.body).appendChild(target);
			let setVisible: (visible: boolean) => void = () => {};
			const logicalRoot = mount(DeferredPortalEvents, {
				target,
				register: (setter) => {
					setVisible = setter;
				},
				log: (label) => log.push(label),
			});
			try {
				expect(target.querySelector('.deferred-portal-target')).toBeNull();
				flushSync(() => setVisible(true));
				const button = target.querySelector<HTMLButtonElement>('.deferred-portal-target');
				expect(button).not.toBeNull();
				button!.click();
				const expected = ['logical capture', 'target capture', 'target bubble', 'logical bubble'];
				if (physicalRoot !== null) {
					expected.unshift('physical capture');
					expected.push('physical bubble');
				}
				expect(log).toEqual(expected);
			} finally {
				logicalRoot.unmount();
				physicalRoot?.unmount();
				target.remove();
			}
		},
	);

	it('keeps late portal content with its own logical parent when a shared target owner unmounts', () => {
		const log: string[] = [];
		const target = document.createElement('div');
		document.body.appendChild(target);
		const emptyOwner = mount(DeferredPortalEvents, {
			target,
			register: () => {},
			log: (label) => log.push('empty: ' + label),
		});
		let setVisible: (visible: boolean) => void = () => {};
		const visibleOwner = mount(DeferredPortalEvents, {
			target,
			register: (setter) => {
				setVisible = setter;
			},
			log: (label) => log.push('visible: ' + label),
		});
		try {
			flushSync(() => setVisible(true));
			target.querySelector<HTMLButtonElement>('.deferred-portal-target')!.click();
			const expected = [
				'visible: logical capture',
				'visible: target capture',
				'visible: target bubble',
				'visible: logical bubble',
			];
			expect(log).toEqual(expected);
			emptyOwner.unmount();
			flushSync(() => setVisible(false));
			expect(target.querySelector('.deferred-portal-target')).toBeNull();
			flushSync(() => setVisible(true));
			target.querySelector<HTMLButtonElement>('.deferred-portal-target')!.click();
			expect(log).toEqual([...expected, ...expected]);
		} finally {
			emptyOwner.unmount();
			visibleOwner.unmount();
			target.remove();
		}
	});

	it('preserves late portal ownership when a native target listener moves the host before bubbling', () => {
		const log: string[] = [];
		const target = document.createElement('div');
		const destination = document.createElement('div');
		document.body.append(target, destination);
		target.addEventListener('auxclick', () => log.push('native capture'), true);
		let setVisible: (visible: boolean) => void = () => {};
		const root = mount(DeferredPortalEvents, {
			target,
			register: (setter) => {
				setVisible = setter;
			},
			log: (label) => log.push(label),
		});
		try {
			flushSync(() => setVisible(true));
			const button = target.querySelector<HTMLButtonElement>('.deferred-portal-target')!;
			button.addEventListener('auxclick', () => {
				log.push('native move');
				destination.appendChild(button);
			});
			// No auxclick capture binding is authored: ordinary native capture must
			// preserve the original portal route before the target listener moves it.
			button.dispatchEvent(new MouseEvent('auxclick', { bubbles: true }));
			expect(destination.firstElementChild).toBe(button);
			expect(log).toEqual(['native capture', 'native move', 'target bubble', 'logical bubble']);
		} finally {
			root.unmount();
			target.remove();
			destination.remove();
		}
	});
});

describe('ReactDOMEventListener — propagation across nested roots', () => {
	// Per ReactDOMEventListener-test.js:32 — should propagate events one level down
	it('propagates events one level down (child root nested inside a parent root)', () => {
		const log = createLog();
		const child = mount(RootDiv, { name: 'childdiv', onOut: outLogger(log) });
		const parent = mount(RootDiv, { name: 'parentdiv', onOut: outLogger(log) });
		// Physically nest the child ROOT CONTAINER inside the parent root's div.
		parent.find('.parentdiv').appendChild(child.container);

		child
			.find('.childdiv')
			.dispatchEvent(new Event('mouseout', { bubbles: true, cancelable: true }));

		// Both handlers fire, inner-first, each seeing its OWN element as
		// currentTarget — and exactly once each.
		expect(log.drain()).toEqual(['out:childdiv', 'out:parentdiv']);
		child.unmount();
		parent.unmount();
	});

	// Per ReactDOMEventListener-test.js:65 — should propagate events two levels down
	it('propagates events two levels down (three nested roots)', () => {
		const log = createLog();
		const child = mount(RootDiv, { name: 'childdiv', onOut: outLogger(log) });
		const parent = mount(RootDiv, { name: 'parentdiv', onOut: outLogger(log) });
		const grand = mount(RootDiv, { name: 'granddiv', onOut: outLogger(log) });
		parent.find('.parentdiv').appendChild(child.container);
		grand.find('.granddiv').appendChild(parent.container);

		child
			.find('.childdiv')
			.dispatchEvent(new Event('mouseout', { bubbles: true, cancelable: true }));

		expect(log.drain()).toEqual(['out:childdiv', 'out:parentdiv', 'out:granddiv']);
		child.unmount();
		parent.unmount();
		grand.unmount();
	});

	// Lifecycle extension of ReactDOMEventListener's nested-root propagation:
	// unmounting cannot replay an inner root's completed handler queue when the
	// same native event subsequently reaches an enclosing root. Whether a removed
	// target still reaches outer framework handlers is intentionally not pinned.
	it.each([
		{ at: 'handler', reattach: false },
		{ at: 'handler', reattach: true },
		{ at: 'native bridge', reattach: false },
		{ at: 'native bridge', reattach: true },
	] as const)(
		'does not replay an unmounted root during native propagation (%j)',
		({ at, reattach }) => {
			const log: string[] = [];
			const outer = mount(PropagationTree, { onParent: () => log.push('outer') });
			const bridge = document.createElement('div');
			outer.find('.propagation-parent').appendChild(bridge);
			const innerContainer = document.createElement('div');
			bridge.appendChild(innerContainer);
			const inner = createRoot(innerContainer);
			let target: HTMLElement | null = null;
			const retire = () => {
				inner.unmount();
				if (reattach && target !== null) innerContainer.appendChild(target);
			};
			inner.render(PropagationTree, {
				onTarget: () => {
					log.push('inner target');
					if (at === 'handler') retire();
				},
				onParent: () => log.push('inner parent'),
			});
			target = innerContainer.querySelector<HTMLElement>('.propagation-target')!;
			bridge.addEventListener('click', () => {
				log.push('native bridge');
				if (at === 'native bridge') retire();
			});
			try {
				target.click();
				expect(log.filter((entry) => entry.startsWith('inner '))).toEqual([
					'inner target',
					'inner parent',
				]);
			} finally {
				inner.unmount();
				outer.unmount();
			}
		},
	);

	// Per ReactDOMEventListener-test.js:106 — should not get confused by disappearing elements
	it('is not confused by the clicked element disappearing in its own handler update', () => {
		const r = mount(DisappearingButton);
		expect(r.find('.dwrap').textContent).toBe('not yet clicked');
		r.click('button');
		expect(r.find('.dwrap').textContent).toBe('clicked!');
		expect(r.container.querySelector('button')).toBe(null);
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:157 — should batch between handlers from
	// different roots (discrete).
	//
	// Each root handles its own segment of the native event path. A discrete
	// update commits after the inner root, before the event reaches the outer one.
	it('commits a discrete update before the event enters its outer root', () => {
		const log = createLog();
		let childSet: (v: string) => void = () => {};
		const childR = mount(BatchChild, {
			register: (s: (v: string) => void) => (childSet = s),
			onEvent: () => {
				childSet('1');
				log.push('read:' + childR.find('.child-span').textContent);
			},
		});
		const parentR = mount(BatchParent, {
			onEvent: () => {
				childSet('2');
				log.push('read:' + childR.find('.child-span').textContent);
			},
		});
		parentR.find('.parent-section').appendChild(childR.container);

		const span = childR.find('.child-span') as HTMLElement;
		span.click();

		expect(log.drain()).toEqual(['read:Child', 'read:1']);
		// Discrete event: the final update is committed synchronously before the
		// dispatch returns to the browser (React parity).
		expect(span.textContent).toBe('2');
		childR.unmount();
		parentR.unmount();
	});

	// Per ReactDOMEventListener-test.js:231 — should batch between handlers from
	// different roots (continuous). Continuous events don't force a mid-event
	// flush in React either, so here octane and React agree on every read.
	it('batches between handlers from different roots (continuous): no flush until after the event', () => {
		const log = createLog();
		let childSet: (v: string) => void = () => {};
		const childR = mount(BatchChild, {
			register: (s: (v: string) => void) => (childSet = s),
			onEvent: () => {
				childSet('1');
				log.push('read:' + childR.find('.child-span').textContent);
			},
		});
		const parentR = mount(BatchParent, {
			onEvent: () => {
				childSet('2');
				log.push('read:' + childR.find('.child-span').textContent);
			},
		});
		parentR.find('.parent-section').appendChild(childR.container);

		const span = childR.find('.child-span') as HTMLElement;
		span.dispatchEvent(new Event('mouseout', { bubbles: true, cancelable: true }));

		// Continuous event: still batching during both handlers (matches React).
		expect(log.drain()).toEqual(['read:Child', 'read:Child']);
		// The batched update is applied after the event.
		flushSync(() => {});
		expect(span.textContent).toBe('2');
		childR.unmount();
		parentR.unmount();
	});
});

describe('ReactDOMEventListener — native listeners between nested roots', () => {
	// Derived from ReactDOMEventPropagation-test.js:2552, :2620, and :2690:
	// a native listener between roots runs between their framework dispatches.
	it.each(['none', 'capture', 'bubble'] as const)(
		'preserves native interleaving when propagation stops at %s',
		(stopAt) => {
			const log: string[] = [];
			const outer = mount(PropagationTree, {
				onParentCapture: () => log.push('outer capture'),
				onParent: () => log.push('outer bubble'),
			});
			const inner = mount(PropagationTree, {
				onParentCapture: () => log.push('inner capture'),
				onTarget: () => log.push('inner target'),
				onParent: () => log.push('inner bubble'),
			});
			const bridge = document.createElement('div');
			outer.find('.propagation-parent').appendChild(bridge);
			bridge.appendChild(inner.container);
			bridge.addEventListener('click', (event) => {
				log.push('native bubble');
				if (stopAt === 'bubble') event.stopPropagation();
			});
			bridge.addEventListener(
				'click',
				(event) => {
					log.push('native capture');
					if (stopAt === 'capture') event.stopPropagation();
				},
				true,
			);
			try {
				(inner.find('.propagation-target') as HTMLElement).click();
				const expected = ['outer capture', 'native capture'];
				if (stopAt !== 'capture') {
					expected.push('inner capture', 'inner target', 'inner bubble', 'native bubble');
					if (stopAt === 'none') expected.push('outer bubble');
				}
				expect(log).toEqual(expected);
			} finally {
				inner.unmount();
				outer.unmount();
			}
		},
	);

	// Hydration extension of ReactDOMEventListener-test.js:32 and :1176:
	// adopted roots retain the same native interleaving as newly mounted roots.
	it('preserves native interleaving across hydrated roots without replacing their nodes', () => {
		const server = loadServerFixture<{ PropagationTree: typeof PropagationTree }>(
			join(process.cwd(), 'packages/octane/tests/conformance/_fixtures/event-listener.tsrx'),
		);
		const { html } = ServerRT.renderToString(server.PropagationTree, {});
		const log: string[] = [];
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const parent = container.querySelector('.propagation-parent')!;
		const outer = hydrateRoot(container, PropagationTree, {
			onParentCapture: () => log.push('outer capture'),
			onParent: () => log.push('outer bubble'),
		});
		flushSync(() => {});
		const bridge = document.createElement('div');
		const innerContainer = document.createElement('div');
		parent.appendChild(bridge);
		bridge.appendChild(innerContainer);
		innerContainer.innerHTML = html;
		const target = innerContainer.querySelector('.propagation-target')!;
		const inner = hydrateRoot(innerContainer, PropagationTree, {
			onParentCapture: () => log.push('inner capture'),
			onTarget: () => log.push('target'),
			onParent: () => log.push('inner bubble'),
		});
		flushSync(() => {});
		bridge.addEventListener('click', () => log.push('native capture'), true);
		bridge.addEventListener('click', () => log.push('native bubble'));
		try {
			expect(container.querySelector('.propagation-parent')).toBe(parent);
			expect(innerContainer.querySelector('.propagation-target')).toBe(target);
			target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(log).toEqual([
				'outer capture',
				'native capture',
				'inner capture',
				'target',
				'inner bubble',
				'native bubble',
				'outer bubble',
			]);
		} finally {
			inner.unmount();
			outer.unmount();
			container.remove();
		}
	});
});

describe('ReactDOMEventListener — native and framework cancellation', () => {
	// Source-derived parity regressions, not direct ports of an upstream test:
	// React initializes logical propagation independently of native cancelBubble,
	// then checks that logical flag between framework listeners.
	// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/SyntheticEvent.js#L81
	// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/DOMPluginEventSystem.js#L266
	it.each(['stopPropagation', 'stopImmediatePropagation'] as const)(
		'honors an earlier root-native %s before framework handlers',
		(method) => {
			const log: string[] = [];
			const observed: Event[] = [];
			const container = document.createElement('div');
			document.body.appendChild(container);
			container.addEventListener('click', (event) => {
				log.push('native before');
				event[method]();
			});
			const root = createRoot(container);
			root.render(PropagationTree, {
				onTarget: (event: Event) => {
					log.push('target');
					observed.push(event);
				},
				onParent: (event: Event) => {
					log.push('parent');
					observed.push(event);
				},
			});
			container.addEventListener('click', () => log.push('native after'));
			const outside = () => log.push('outside');
			document.body.addEventListener('click', outside);
			const event = new MouseEvent('click', { bubbles: true });
			try {
				container.querySelector('.propagation-target')!.dispatchEvent(event);
				expect(log).toEqual(
					method === 'stopPropagation'
						? ['native before', 'target', 'parent', 'native after']
						: ['native before'],
				);
				expect(observed.map((seen) => seen === event)).toEqual(
					method === 'stopPropagation' ? [true, true] : [],
				);
			} finally {
				document.body.removeEventListener('click', outside);
				root.unmount();
				container.remove();
			}
		},
	);

	// Calling stopPropagation in a framework handler cancels logical ancestors.
	// stopImmediatePropagation retains the native-only behavior of React's
	// nativeEvent.stopImmediatePropagation: it blocks subsequent native listeners,
	// not the already-running framework queue (source references above).
	it.each(['stopPropagation', 'stopImmediatePropagation'] as const)(
		'preserves the selected framework/native scope of %s inside a handler',
		(method) => {
			const log: string[] = [];
			const observed: Event[] = [];
			const r = mount(PropagationTree, {
				onTarget: (event) => {
					log.push('target');
					observed.push(event);
					event[method]();
				},
				onParent: (event) => {
					log.push('parent');
					observed.push(event);
				},
			});
			r.container.addEventListener('click', () => log.push('native after'));
			const outside = () => log.push('outside');
			document.body.addEventListener('click', outside);
			const event = new MouseEvent('click', { bubbles: true });
			try {
				r.find('.propagation-target').dispatchEvent(event);
				expect(log).toEqual(
					method === 'stopPropagation' ? ['target', 'native after'] : ['target', 'parent'],
				);
				expect(observed.map((seen) => seen === event)).toEqual(
					method === 'stopPropagation' ? [true] : [true, true],
				);
			} finally {
				document.body.removeEventListener('click', outside);
				r.unmount();
			}
		},
	);

	// Capture has its own logical queue; native immediate cancellation must not
	// truncate that queue, but the browser still prevents target/bubble delivery.
	it.each(['stopPropagation', 'stopImmediatePropagation'] as const)(
		'keeps capture-queue cancellation distinct from native %s',
		(method) => {
			const log: string[] = [];
			let nativeStopped: boolean | undefined;
			const r = mount(PropagationTree, {
				onParentCapture: (event: Event) => {
					log.push('parent capture');
					event[method]();
				},
				onTargetCapture: (event: Event) => {
					log.push('target capture');
					nativeStopped = event.cancelBubble;
				},
				onTarget: () => log.push('target bubble'),
			});
			r.container.addEventListener('click', () => log.push('native capture'), true);
			try {
				(r.find('.propagation-target') as HTMLElement).click();
				expect(log).toEqual(
					method === 'stopPropagation'
						? ['parent capture', 'native capture']
						: ['parent capture', 'target capture'],
				);
				if (method === 'stopImmediatePropagation') expect(nativeStopped).toBe(true);
			} finally {
				r.unmount();
			}
		},
	);

	// Reentrant extension of the same source-derived cancellation contract:
	// stopping a nested native event must not stop its caller's logical ancestors.
	it('isolates nested cancellation and restores the native event after dispatch', () => {
		const log: string[] = [];
		const resumedTargets: (EventTarget | null)[] = [];
		const r = mount(PropagationTree, {
			onTarget: (event) => {
				const detail = (event as MouseEvent).detail;
				log.push('target:' + detail);
				if (detail === 2) event.stopPropagation();
				else {
					r.find('.propagation-target').dispatchEvent(
						new MouseEvent('click', { bubbles: true, detail: 2 }),
					);
					resumedTargets.push(event.currentTarget);
				}
			},
			onParent: (event) => log.push('parent:' + (event as MouseEvent).detail),
		});
		const event = new MouseEvent('click', { bubbles: true, detail: 1 });
		const stopPropagation = event.stopPropagation;
		try {
			r.find('.propagation-target').dispatchEvent(event);
			expect(log).toEqual(['target:1', 'target:2', 'parent:1']);
			expect(resumedTargets[0]).toBe(r.find('.propagation-target'));
			expect(event.stopPropagation).toBe(stopPropagation);
			expect(event.currentTarget).toBe(null);
		} finally {
			r.unmount();
		}
	});

	// Native EventTarget permits redispatch after a dispatch returns; logical
	// propagation state must be scoped to that dispatch, not the Event's lifetime.
	it('runs both phases again when the same native event is synchronously redispatched', () => {
		const log: string[] = [];
		let stop = true;
		const r = mount(PropagationTree, {
			onParentCapture: () => log.push('capture'),
			onTarget: (event) => {
				log.push('target');
				if (stop) event.stopPropagation();
			},
			onParent: () => log.push('parent'),
		});
		const event = new MouseEvent('click', { bubbles: true });
		try {
			const target = r.find('.propagation-target');
			target.dispatchEvent(event);
			stop = false;
			target.dispatchEvent(event);
			expect(log).toEqual(['capture', 'target', 'capture', 'target', 'parent']);
		} finally {
			r.unmount();
		}
	});

	// Octane uses the native object rather than a SyntheticEvent wrapper. A
	// consumer's own stopPropagation method and descriptor must survive dispatch.
	it.each([
		{ configurable: true, writable: false },
		{ configurable: false, writable: true },
	])('restores an own stopPropagation descriptor (%j) before later native listeners', (flags) => {
		const log: string[] = [];
		const event = new MouseEvent('click', { bubbles: true });
		const stopPropagation = function (this: Event) {
			log.push('own stop');
			Event.prototype.stopPropagation.call(this);
		};
		Object.defineProperty(event, 'stopPropagation', {
			value: stopPropagation,
			enumerable: true,
			...flags,
		});
		const descriptor = Object.getOwnPropertyDescriptor(event, 'stopPropagation');
		const observed: (PropertyDescriptor | undefined)[] = [];
		const r = mount(PropagationTree, {
			onTarget: (event) => {
				log.push('target');
				event.stopPropagation();
			},
			onParent: () => log.push('parent'),
		});
		r.container.addEventListener('click', (nativeEvent) => {
			log.push('native after');
			observed.push(Object.getOwnPropertyDescriptor(nativeEvent, 'stopPropagation'));
		});
		try {
			r.find('.propagation-target').dispatchEvent(event);
			expect(log).toEqual(['target', 'own stop', 'native after']);
			expect(observed).toEqual([descriptor]);
			expect(Object.getOwnPropertyDescriptor(event, 'stopPropagation')).toEqual(descriptor);
		} finally {
			r.unmount();
		}
	});

	// A retained native method remains callable after the framework's dispatch
	// scope has ended; it still sets the original Event's native stop flag.
	it.each(['stopPropagation', 'stopImmediatePropagation'] as const)(
		'keeps a retained %s callable after dispatch',
		(method) => {
			const retained: (() => void)[] = [];
			const r = mount(PropagationTree, {
				onTarget: (event) => retained.push(event[method]),
			});
			const event = new MouseEvent('click', { bubbles: true });
			try {
				r.find('.propagation-target').dispatchEvent(event);
				expect(event.cancelBubble).toBe(false);
				retained[0].call(event);
				expect(event.cancelBubble).toBe(true);
			} finally {
				r.unmount();
			}
		},
	);

	// An immutable own method cannot be interposed without replacing the Event.
	// It retains native-only cancellation, like calling Event.prototype directly.
	it('keeps a locked own stop method native-only without affecting the next event', () => {
		const log: string[] = [];
		const nativeFlags: boolean[] = [];
		const event = new MouseEvent('click', { bubbles: true });
		const stopPropagation = function (this: Event) {
			log.push('own stop');
			Event.prototype.stopPropagation.call(this);
		};
		Object.defineProperty(event, 'stopPropagation', {
			value: stopPropagation,
			configurable: false,
			writable: false,
		});
		const descriptor = Object.getOwnPropertyDescriptor(event, 'stopPropagation');
		const r = mount(PropagationTree, {
			onTarget: (event) => {
				log.push('target');
				event.stopPropagation();
			},
			onParent: (event) => {
				log.push('parent');
				nativeFlags.push(event.cancelBubble);
			},
		});
		r.container.addEventListener('click', () => log.push('native after'));
		try {
			const target = r.find('.propagation-target');
			target.dispatchEvent(event);
			expect(log).toEqual(['target', 'own stop', 'parent', 'native after']);
			expect(nativeFlags).toEqual([true]);
			expect(Object.getOwnPropertyDescriptor(event, 'stopPropagation')).toEqual(descriptor);
			log.length = 0;
			target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(log).toEqual(['target', 'native after']);
		} finally {
			r.unmount();
		}
	});
});

describe('ReactDOMEventListener — dispatch-once + form events', () => {
	// Per ReactDOMEventListener-test.js:295 — should not fire duplicate events for a React DOM tree
	it('does not fire duplicate events for a single tree', () => {
		const targets: EventTarget[] = [];
		const r = mount(SingleTreeDedup, {
			onOut: (e: Event) => targets.push(e.target as EventTarget),
		});
		const inner = r.find('.inner');
		inner.dispatchEvent(new Event('mouseout', { bubbles: true, cancelable: true }));
		expect(targets).toEqual([inner]);
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:334 — should not fire form events twice
	it('does not fire form events twice (invalid / reset / submit)', () => {
		let invalid = 0;
		let reset = 0;
		let submit = 0;
		const r = mount(FormEvents, {
			onInvalid: () => invalid++,
			onReset: () => reset++,
			onSubmit: () => submit++,
		});
		const form = r.find('.frm');
		const input = r.find('.inp');

		// https://developer.mozilla.org/en-US/docs/Web/Events/invalid
		input.dispatchEvent(new Event('invalid', { bubbles: false }));
		expect(invalid).toBe(1);

		form.dispatchEvent(new Event('reset', { bubbles: true }));
		expect(reset).toBe(1);

		form.dispatchEvent(new Event('submit', { bubbles: true }));
		expect(submit).toBe(1);

		form.dispatchEvent(new Event('submit', { bubbles: true }));
		expect(submit).toBe(2); // it already fired in this test
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:400 — should not receive submit events if
	// native, interim DOM handler prevents it. octane delegates with REAL native
	// listeners, so an interim non-octane handler stopping propagation keeps the
	// event from ever reaching the delegated root listener.
	it('does not receive submit/reset if a native interim DOM handler stops propagation', () => {
		let reset = 0;
		let submit = 0;
		const r = mount(FormEvents, {
			onInvalid: () => {},
			onReset: () => reset++,
			onSubmit: () => submit++,
		});
		const interim = r.find('.interim') as HTMLElement;
		interim.onsubmit = (e) => e.stopPropagation();
		interim.onreset = (e) => e.stopPropagation();

		const form = r.find('.frm');
		form.dispatchEvent(new Event('submit', { bubbles: true }));
		form.dispatchEvent(new Event('reset', { bubbles: true }));

		expect(submit).toBe(0);
		expect(reset).toBe(0);
		r.unmount();
	});
});

describe('ReactDOMEventListener — non-bubbling event delivery', () => {
	// Per ReactDOMEventListener-test.js:446 — should dispatch loadstart only for
	// media elements. React only registers `loadstart` on media elements, so its
	// img handler never fires — a synthetic-registration artifact octane does not
	// copy: on the platform, a listener on the element fires for a dispatched
	// event regardless of tag.
	//
	// Octane capture-delegates the non-bubbling load/media family, so the video's
	// handler receives the native event.
	it('delivers loadstart to a direct handler on the target element', () => {
		const log = createLog();
		const r = mount(MediaLoadTargets, { log: log.push });
		r.find('.video').dispatchEvent(new Event('loadstart', { bubbles: false }));
		try {
			expect(log.drain()).toEqual(['video-loadstart']);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMEventListener-test.js:607 — should dispatch load for embed elements.
	it('delivers load to a direct handler on an embed element', () => {
		const log = createLog();
		const r = mount(MediaLoadTargets, { log: log.push });
		r.find('.embed').dispatchEvent(new Event('load', { bubbles: false }));
		try {
			expect(log.drain()).toEqual(['embed-load']);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMEventListener-test.js:706 — should bubble non-native bubbling
	// toggle events. Capture delegation delivers to the target, then walks to the
	// ancestor even though the native event does not bubble.
	it('delivers toggle to the <details> and its ancestor', () => {
		const log = createLog();
		const r = mount(NonBubblingPairs, { log: log.push });
		r.find('.det').dispatchEvent(new Event('toggle', { bubbles: false }));
		try {
			expect(log.drain()).toEqual(['det-toggle', 'anc-toggle']);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMEventListener-test.js:733 — should bubble non-native bubbling
	// cancel/close events, target first and then ancestor.
	it('delivers cancel/close to the <dialog> and its ancestor', () => {
		const log = createLog();
		const r = mount(NonBubblingPairs, { log: log.push });
		r.find('.dlg').dispatchEvent(new Event('cancel', { bubbles: false }));
		r.find('.dlg').dispatchEvent(new Event('close', { bubbles: false }));
		try {
			expect(log.drain()).toEqual(['dlg-cancel', 'anc-cancel', 'dlg-close', 'anc-close']);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMEventListener-test.js:767 — should bubble non-native bubbling
	// media events through the logical ancestor tree.
	it('delivers play to the <video> and its ancestor', () => {
		const log = createLog();
		const r = mount(NonBubblingPairs, { log: log.push });
		r.find('.vid').dispatchEvent(new Event('play', { bubbles: false }));
		try {
			expect(log.drain()).toEqual(['vid-play', 'anc-play']);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMEventListener-test.js:638 — delegate media events even without
	// a direct listener on the target.
	it('delivers a bare video’s play to an ancestor-only handler', () => {
		const log = createLog();
		const r = mount(AncestorOnlyHandlers, { log: log.push });
		r.find('.vid').dispatchEvent(new Event('play', { bubbles: false }));
		expect(log.drain()).toEqual(['anc-play']);
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:669 — delegate dialog events even without
	// direct listeners on the target.
	it('delivers a bare dialog’s close/cancel to ancestor-only handlers', () => {
		const log = createLog();
		const r = mount(AncestorOnlyHandlers, { log: log.push });
		r.find('.dlg').dispatchEvent(new Event('close', { bubbles: false }));
		r.find('.dlg').dispatchEvent(new Event('cancel', { bubbles: false }));
		expect(log.drain()).toEqual(['anc-close', 'anc-cancel']);
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:794 — should bubble non-native bubbling
	// invalid events. octane DELIBERATELY reproduces this one (runtime.ts
	// CAPTURE_DELEGATED: "React's onInvalid propagates — a form's onInvalid
	// observes its controls' invalid events"), via capture-phase delegation + an
	// upward walk. Matches React: both handlers fire.
	it('propagates invalid to the input handler AND the form handler', () => {
		const log = createLog();
		const r = mount(InvalidForm, { log: log.push });
		r.find('.inp').dispatchEvent(new Event('invalid', { bubbles: false }));
		expect(log.drain()).toEqual(['input-invalid', 'form-invalid']);
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:822 — should handle non-bubbling capture
	// events correctly. The capture phase reaches the root even for non-bubbling
	// events, so onPlayCapture fires root→target with per-element currentTarget.
	it('fires capture handlers root→target for a non-bubbling event', () => {
		const log = createLog();
		const r = mount(PlayCaptureTree, { log: log.push });
		r.find('.inner').dispatchEvent(new Event('play', { bubbles: false }));
		expect(log.drain()).toEqual(['cap:outer', 'cap:mid', 'cap:inner']);
		// Dispatching at the outer element fires only its own capture handler.
		r.find('.outer').dispatchEvent(new Event('play', { bubbles: false }));
		expect(log.drain()).toEqual(['cap:outer']);
		r.unmount();
	});
});

describe('ReactDOMEventListener — scroll (not emulated upward)', () => {
	const REACT_ORDER = [
		'onScroll:capture:grand',
		'onScroll:capture:parent',
		'onScroll:capture:child',
		'onScroll:bubble:child',
		'onScrollEnd:capture:grand',
		'onScrollEnd:capture:parent',
		'onScrollEnd:capture:child',
		'onScrollEnd:bubble:child',
	];

	// Per ReactDOMEventListener-test.js:875 — should not emulate bubbling of
	// scroll events. Captures fire on all three levels before the target's handler;
	// no ancestor bubble handler fires.
	it('runs the capture phase before the target’s bubble handler for scroll/scrollend', () => {
		const log = createLog();
		const r = mount(ScrollTreeFull, { log: log.push });
		r.find('.child').dispatchEvent(new Event('scroll', { bubbles: false }));
		r.find('.child').dispatchEvent(new Event('scrollend', { bubbles: false }));
		try {
			expect(log.drain()).toEqual(REACT_ORDER);
		} finally {
			r.unmount();
		}
	});

	// Set-level guard for the same case: bubble scroll fires on the scrolled
	// element ONLY (no upward emulation), captures fire on every level.
	it('does not emulate scroll/scrollend bubbling upward (set parity)', () => {
		const log = createLog();
		const r = mount(ScrollTreeFull, { log: log.push });
		r.find('.child').dispatchEvent(new Event('scroll', { bubbles: false }));
		r.find('.child').dispatchEvent(new Event('scrollend', { bubbles: false }));
		expect([...log.drain()].sort()).toEqual([...REACT_ORDER].sort());
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:951 — should not emulate bubbling of
	// scroll events (no own handler). With no handler on the scrolled child, only
	// the ancestors' CAPTURE handlers fire — nothing bubbles.
	it('fires only ancestor capture handlers when the scrolled element has no handler', () => {
		const log = createLog();
		const r = mount(ScrollTreeNoChild, { log: log.push });
		r.find('.child').dispatchEvent(new Event('scroll', { bubbles: false }));
		r.find('.child').dispatchEvent(new Event('scrollend', { bubbles: false }));
		expect(log.drain()).toEqual([
			'onScroll:capture:grand',
			'onScroll:capture:parent',
			'onScrollEnd:capture:grand',
			'onScrollEnd:capture:parent',
		]);
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:1013 — should subscribe to scroll during
	// updates. Handlers attached by an UPDATE fire; re-rendering with fresh inline
	// functions doesn't double-fire; removing them detaches. Asserted as a set
	// (order-insensitive) — the capture/bubble interleaving is asserted exactly
	// by the :875 test above.
	it('subscribes to scroll during updates, dedupes on re-render, and detaches', () => {
		const log = createLog();
		const mk = () => ({
			onScroll: (e: Event) => log.push('onScroll:bubble:' + (e.currentTarget as Element).className),
			onScrollCapture: (e: Event) =>
				log.push('onScroll:capture:' + (e.currentTarget as Element).className),
			onScrollEnd: (e: Event) =>
				log.push('onScrollEnd:bubble:' + (e.currentTarget as Element).className),
			onScrollEndCapture: (e: Event) =>
				log.push('onScrollEnd:capture:' + (e.currentTarget as Element).className),
		});
		const dispatch = (r: ReturnType<typeof mount>) => {
			r.find('.child').dispatchEvent(new Event('scroll', { bubbles: false }));
			r.find('.child').dispatchEvent(new Event('scrollend', { bubbles: false }));
		};
		const EXPECTED = [
			'onScroll:bubble:child',
			'onScroll:capture:child',
			'onScroll:capture:grand',
			'onScroll:capture:parent',
			'onScrollEnd:bubble:child',
			'onScrollEnd:capture:child',
			'onScrollEnd:capture:grand',
			'onScrollEnd:capture:parent',
		];

		// Mount without handlers: nothing is subscribed.
		const r = mount(ScrollSubscribe, {});
		dispatch(r);
		expect(log.drain()).toEqual([]);

		// Update to attach.
		r.update(ScrollSubscribe, mk());
		dispatch(r);
		expect([...log.drain()].sort()).toEqual(EXPECTED);

		// Update with FRESH inline functions (the reattachment codepath, not a
		// bailout): still exactly one dispatch per handler.
		r.update(ScrollSubscribe, mk());
		dispatch(r);
		expect([...log.drain()].sort()).toEqual(EXPECTED);

		// Update to detach.
		r.update(ScrollSubscribe, {});
		dispatch(r);
		expect(log.drain()).toEqual([]);
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:1176 — should subscribe to scroll during
	// hydration. Server-render the tree, hydrate with handlers, and the ADOPTED
	// elements must dispatch; a later update detaches. Set-parity assertion (see
	// the :875 ordering pin).
	it('subscribes to scroll during hydration and detaches on update', () => {
		const FIX = join(
			process.cwd(),
			'packages/octane/tests/conformance/_fixtures/event-listener-hydrate.tsrx',
		);
		const FILE = 'event-listener-hydrate.tsrx';
		const serverModule = (): Record<string, any> => {
			let { code } = compile(readFileSync(FIX, 'utf8'), FILE, { mode: 'server' });
			code = code.replace(
				/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
				(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
			);
			code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
			code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
			return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
		};
		const clientModule = (): Record<string, any> => {
			let { code } = compile(readFileSync(FIX, 'utf8'), FILE, { mode: 'client' });
			code = code.replace(
				/import\s*\{([^}]*)\}\s*from\s*['"]octane['"];?/g,
				(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
			);
			code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
			code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
			return new Function('__rt', '__exports', code + '\nreturn __exports;')(ClientRT, {});
		};
		const server = serverModule();
		const client = clientModule();

		const log = createLog();
		const handlers = {
			onScroll: (e: Event) => log.push('onScroll:bubble:' + (e.currentTarget as Element).className),
			onScrollCapture: (e: Event) =>
				log.push('onScroll:capture:' + (e.currentTarget as Element).className),
			onScrollEnd: (e: Event) =>
				log.push('onScrollEnd:bubble:' + (e.currentTarget as Element).className),
			onScrollEndCapture: (e: Event) =>
				log.push('onScrollEnd:capture:' + (e.currentTarget as Element).className),
		};

		const container = document.createElement('div');
		document.body.appendChild(container);
		const { html } = ServerRT.renderToString(server.ScrollHydrate, {});
		container.innerHTML = html;
		const child = container.querySelector('.child') as HTMLElement;
		expect(child).toBeTruthy();

		const root = hydrateRoot(container, client.ScrollHydrate, handlers);
		flushSync(() => {});
		// The server node was adopted, not rebuilt.
		expect(container.querySelector('.child')).toBe(child);

		child.dispatchEvent(new Event('scroll', { bubbles: false }));
		child.dispatchEvent(new Event('scrollend', { bubbles: false }));
		expect([...log.drain()].sort()).toEqual([
			'onScroll:bubble:child',
			'onScroll:capture:child',
			'onScroll:capture:grand',
			'onScroll:capture:parent',
			'onScrollEnd:bubble:child',
			'onScrollEnd:capture:child',
			'onScrollEnd:capture:grand',
			'onScrollEnd:capture:parent',
		]);

		// Update to detach.
		flushSync(() => root.render(client.ScrollHydrate, {}));
		child.dispatchEvent(new Event('scroll', { bubbles: false }));
		child.dispatchEvent(new Event('scrollend', { bubbles: false }));
		expect(log.drain()).toEqual([]);

		root.unmount();
		container.remove();
	});
});

/**
 * Cases from ReactDOMEventListener-test.js NOT ported (out of scope):
 *
 * - :490 "should not attempt to listen to unnecessary events on the top level" —
 *   asserts WHICH native listeners React's synthetic system attaches (media
 *   events per-element, everything else at the root). Pure listener-registration
 *   internals of the synthetic layer; octane's lazy per-event-type delegation is
 *   a different architecture by design. The user-visible outcomes of the same
 *   case (video onPlay delivery + ancestor delegation) are covered by the
 *   :767/:638 ports above.
 *
 * - :1275 "should not subscribe to selectionchange twice" — counts
 *   document-level addEventListener('selectionchange') calls across two roots.
 *   Synthetic-system listener-registration internals; octane attaches no
 *   document-level selectionchange listener at all.
 */
