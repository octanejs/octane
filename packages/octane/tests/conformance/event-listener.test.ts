/**
 * Conformance port of react-dom/src/__tests__/ReactDOMEventListener-test.js
 * (React v19.2.7) — event delegation with REAL native DOM events.
 *
 * Scope notes (per docs/react-parity-migration-plan.md §2 + maintainer ruling):
 * octane will never replicate React's SYNTHETIC event layer. Behaviors that
 * exist only because the synthetic layer re-dispatches non-bubbling events to
 * ancestor JSX handlers (toggle/cancel/close/media/load) are INTENTIONAL
 * DIVERGENCES — those cases are ported as assertions of octane's platform
 * contract (ancestor handler does NOT fire). Delivery of a non-bubbling event
 * to the TARGET's OWN handler IS the platform contract, so where octane's
 * delegation currently misses it the case is pinned as `it.fails` + `// GAP`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { mount, createLog, type EffectLog } from '../_helpers';
import * as ClientRT from '../../src/index.js';
import { flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import {
	RootDiv,
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
		// currentTarget — and exactly once each (the outer root's delegated
		// listener must not re-walk the chain).
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
	// Intentional divergence (synthetic architecture): React attaches ONE listener
	// per root, so a discrete event entering two nested roots flushes between the
	// two listeners (their test reads '1' inside the outer root's handler — a
	// behavior React itself documents as incidental "over-flushing"). octane's
	// single deduped delegated walk gives ONE batch window: neither handler
	// observes a mid-event commit. The React-shared contract that IS asserted:
	// updates are batched while handlers run, and a discrete event's updates are
	// committed synchronously by the time the dispatch returns.
	it('batches between handlers from different roots (discrete): one batch window, committed by dispatch end', () => {
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

		// Both handlers ran; neither saw a mid-event flush (React's second read
		// would be '1' — see divergence note above).
		expect(log.drain()).toEqual(['read:Child', 'read:Child']);
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
	// GAP: octane delegates every JSX event through a BUBBLE-phase root listener
	// (runtime.ts `delegateEvents`/`dispatchDelegated`); `loadstart` does not
	// bubble and is not in CAPTURE_DELEGATED (runtime.ts:4035), so the event
	// never reaches the delegation root and NEITHER handler fires (React fires
	// the video's). Fix would capture-delegate the non-bubbling load/media family
	// with the TARGET_ONLY treatment.
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

	// Per ReactDOMEventListener-test.js:607 — should dispatch load for embed elements
	// GAP: same root cause as :446 — `load` doesn't bubble and isn't
	// capture-delegated, so the embed's own onLoad never fires (React fires it).
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
	// toggle events. React's synthetic layer fires the ancestor handler too (2
	// calls); the platform does not bubble toggle.
	// GAP (target half): `toggle` never reaches octane's bubble-phase delegation
	// root, so even the <details>' OWN handler doesn't fire. The platform
	// contract is one call — the target's.
	it('delivers toggle to the <details> element’s own handler', () => {
		const log = createLog();
		const r = mount(NonBubblingPairs, { log: log.push });
		r.find('.det').dispatchEvent(new Event('toggle', { bubbles: false }));
		try {
			expect(log.drain()).toEqual(['det-toggle']);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMEventListener-test.js:706 — intentional divergence (synthetic
	// emulation): React re-dispatches toggle so the ancestor's onToggle fires;
	// octane matches the PLATFORM — toggle does not bubble, so an ancestor JSX
	// handler never sees a descendant's toggle.
	it('does NOT emulate toggle bubbling to an ancestor handler (intentional divergence)', () => {
		const log = createLog();
		const r = mount(NonBubblingPairs, { log: log.push });
		r.find('.det').dispatchEvent(new Event('toggle', { bubbles: false }));
		expect(log.drain()).not.toContain('anc-toggle');
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:733 — should bubble non-native bubbling
	// cancel/close events.
	// GAP (target half): cancel/close never reach the bubble-phase delegation
	// root, so the <dialog>'s own onCancel/onClose don't fire (platform: they do).
	it('delivers cancel/close to the <dialog> element’s own handlers', () => {
		const log = createLog();
		const r = mount(NonBubblingPairs, { log: log.push });
		r.find('.dlg').dispatchEvent(new Event('cancel', { bubbles: false }));
		r.find('.dlg').dispatchEvent(new Event('close', { bubbles: false }));
		try {
			expect(log.drain()).toEqual(['dlg-cancel', 'dlg-close']);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMEventListener-test.js:733 — intentional divergence (synthetic
	// emulation): ancestor onCancel/onClose do NOT fire for a descendant dialog's
	// events; octane matches the platform.
	it('does NOT emulate cancel/close bubbling to an ancestor handler (intentional divergence)', () => {
		const log = createLog();
		const r = mount(NonBubblingPairs, { log: log.push });
		r.find('.dlg').dispatchEvent(new Event('cancel', { bubbles: false }));
		r.find('.dlg').dispatchEvent(new Event('close', { bubbles: false }));
		const entries = log.drain();
		expect(entries).not.toContain('anc-cancel');
		expect(entries).not.toContain('anc-close');
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:767 — should bubble non-native bubbling
	// media events.
	// GAP (target half): media events (play etc.) never reach the bubble-phase
	// delegation root, so the <video>'s own onPlay doesn't fire (platform: it does).
	it('delivers play to the <video> element’s own handler', () => {
		const log = createLog();
		const r = mount(NonBubblingPairs, { log: log.push });
		r.find('.vid').dispatchEvent(new Event('play', { bubbles: false }));
		try {
			expect(log.drain()).toEqual(['vid-play']);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMEventListener-test.js:767 — intentional divergence (synthetic
	// emulation): ancestor onPlay does not fire for a descendant video's play.
	it('does NOT emulate media-event bubbling to an ancestor handler (intentional divergence)', () => {
		const log = createLog();
		const r = mount(NonBubblingPairs, { log: log.push });
		r.find('.vid').dispatchEvent(new Event('play', { bubbles: false }));
		expect(log.drain()).not.toContain('anc-play');
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:638 — should delegate media events even
	// without a direct listener. Intentional divergence (synthetic emulation):
	// React's tree delegation fires the ancestor's onPlay even though the video
	// itself has no handler; octane matches the platform — a non-bubbling play
	// never reaches an ancestor's handler.
	it('does NOT deliver a bare video’s play to an ancestor-only handler (intentional divergence)', () => {
		const log = createLog();
		const r = mount(AncestorOnlyHandlers, { log: log.push });
		r.find('.vid').dispatchEvent(new Event('play', { bubbles: false }));
		expect(log.drain()).toEqual([]);
		r.unmount();
	});

	// Per ReactDOMEventListener-test.js:669 — should delegate dialog events even
	// without a direct listener. Intentional divergence (synthetic emulation) —
	// same reasoning as :638.
	it('does NOT deliver a bare dialog’s close/cancel to an ancestor-only handler (intentional divergence)', () => {
		const log = createLog();
		const r = mount(AncestorOnlyHandlers, { log: log.push });
		r.find('.dlg').dispatchEvent(new Event('close', { bubbles: false }));
		r.find('.dlg').dispatchEvent(new Event('cancel', { bubbles: false }));
		expect(log.drain()).toEqual([]);
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
	// scroll events. octane agrees on the SET of handlers (captures on all three
	// levels + bubble on the target only — no upward emulation) but not the ORDER.
	//
	// GAP: octane fires the target's bubble onScroll BEFORE the ancestors'
	// capture handlers (['onScroll:bubble:child', 'onScroll:capture:grand', …]).
	// Both delegated dispatchers are capture-phase listeners on the same root for
	// scroll (runtime.ts CAPTURE_DELEGATED), and `registerDelegationTarget` /
	// `delegateEvents` attach `dispatchDelegated` (which fires the target-only
	// bubble slot) BEFORE `dispatchDelegatedCapture`, so same-node listener
	// registration order inverts the platform's capture-before-bubble ordering.
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

	// Per ReactDOMEventListener-test.js:875 — the SET half of the same case,
	// order-insensitive so it holds regardless of the ordering gap above: bubble
	// scroll fires on the scrolled element ONLY (no upward emulation), captures
	// fire on every level.
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
	// (order-insensitive) — the capture/bubble interleaving is pinned by the :875
	// `it.fails` above.
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
