// Port of react-dom/src/__tests__/ReactDOMEventPropagation-test.js (React 19.2.7).
//
// React's file mounts TWO SEPARATE ReactDOM copies (an outer root nesting an inner
// root) and runs a 10-scenario propagation battery per event type. Octane is a
// single framework instance with a single delegation walk across the whole logical
// tree, so the fixture collapses to ONE root with the same four levels
// (outer-parent > outer > parent > target) and the expected orders are the
// SINGLE-ROOT ones. Two scenarios differ from the React file's printed
// expectations purely because of its two-copies setup (noted inline); everything
// else is order-for-order identical.
//
// ── Skipped cases (intentional divergences, docs/react-parity-migration-plan.md §2) ──
// Octane uses REAL delegated native DOM events; behaviors that exist only because
// of React's synthetic event layer are not targets:
//   • `onChange` polyfill (line 1629) — React synthesizes change from native
//     `input` + value tracking. Octane's onChange is the native change event
//     (§2: controlled components + synthetic onChange, decided 2026-06-24).
//   • `onBeforeInput` polyfill (line 1566) — React synthesizes from `textInput`.
//     Octane listens for the platform's real `beforeinput`.
//   • `onSelect` polyfill (line 1874) — React synthesizes select from
//     keydown/mouseup/focus heuristics. Octane listens for the real `select` event.
//   • enter/leave SYNTHESIS from mouseover/mouseout pairs (lines 1409, 1482) —
//     React derives onMouseEnter/Leave + onPointerEnter/Leave because its root
//     delegation can't hear non-bubbling events. Octane listens for the platform's
//     REAL per-element enter/leave events, which the UA fires with the same
//     common-ancestor semantics. The outcome (per-element order) is asserted below.
//   • cross-copy isolation (two ReactDOM instances not seeing each other's
//     events, e.g. the onChange "outer React doesn't receive the event" case) —
//     meaningless for a single-instance framework.
import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import { Levels } from './_fixtures/event-propagation.tsrx';

// ─────────────────────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────────────────────

interface EventConfig {
	/** React handler prop minus the `on` prefix, e.g. `Click`. */
	react: string;
	/** Line of the source `it` in ReactDOMEventPropagation-test.js. */
	line: number;
	/** Native event type dispatched (and used for addEventListener interop). */
	native: string;
	/** Target tag rendered by the fixture (default div). */
	type?: string;
	/** Extra props for the target element (e.g. popover). */
	targetExtra?: Record<string, unknown>;
	dispatch(node: Element): void;
}

const ev = (init: EventInit = { bubbles: true, cancelable: true }) => {
	return (type: string) => (node: Element) => node.dispatchEvent(new Event(type, init));
};
const plainEvent = ev();
const nonBubbling = ev({ bubbles: false, cancelable: true });
const mouseEvent = (type: string) => (node: Element) =>
	node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
const keyEvent =
	(type: string, init: KeyboardEventInit = {}) =>
	(node: Element) =>
		node.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));

interface PropsOptions {
	/** Which phases get handlers on each level. */
	phases?: 'both' | 'capture' | 'bubble';
	/** Install handlers on the target itself (default true). */
	withTargetListener?: boolean;
	/** Only install handlers on the target (skip the three ancestors). */
	targetOnlyListener?: boolean;
	/** A handler label whose invocation calls e.stopPropagation(). */
	stopAt?: string;
}

function buildProps(log: string[], cfg: EventConfig, opts: PropsOptions = {}): any {
	const phases = opts.phases ?? 'both';
	const mk = (label: string) => (e: Event) => {
		log.push(label);
		if (opts.stopAt === label) e.stopPropagation();
	};
	const pair = (label: string) => {
		const p: Record<string, unknown> = {};
		if (phases !== 'capture') p['on' + cfg.react] = mk(label);
		if (phases !== 'bubble') p['on' + cfg.react + 'Capture'] = mk(label + ' capture');
		return p;
	};
	const ancestors = !opts.targetOnlyListener;
	return {
		type: cfg.type,
		targetProps: {
			...cfg.targetExtra,
			...(opts.withTargetListener === false ? {} : pair('inner')),
		},
		parentProps: ancestors ? pair('inner parent') : {},
		outerProps: ancestors ? pair('outer') : {},
		outerParentProps: ancestors ? pair('outer parent') : {},
	};
}

interface NativeListener {
	at: '.target' | '.parent' | '.outer' | '.outer-parent';
	label: string;
	capture?: boolean;
	stop?: boolean;
}

/** Mount the 4-level fixture, attach raw native listeners, dispatch, return the log. */
function exercise(
	cfg: EventConfig,
	opts: PropsOptions = {},
	natives: NativeListener[] = [],
): string[] {
	const log: string[] = [];
	const r = mount(Levels as any, buildProps(log, cfg, opts));
	for (const n of natives) {
		r.find(n.at).addEventListener(
			cfg.native,
			(e) => {
				log.push(n.label);
				if (n.stop) e.stopPropagation();
			},
			{ capture: !!n.capture },
		);
	}
	cfg.dispatch(r.find('.target'));
	r.unmount();
	return log;
}

const CAPTURES = ['outer parent capture', 'outer capture', 'inner parent capture', 'inner capture'];
const BUBBLES = ['inner', 'inner parent', 'outer', 'outer parent'];
const FULL = [...CAPTURES, ...BUBBLES];

/**
 * The 10-scenario battery of testNativeBubblingEvent
 * (ReactDOMEventPropagation-test.js:1936-1947), single-root expectations.
 */
function assertNativeBubblingEvent(cfg: EventConfig): void {
	// Per :1973 testNativeBubblingEventWithTargetListener — all capture handlers
	// root→target, then all bubble handlers target→root.
	expect(exercise(cfg)).toEqual(FULL);

	// Per :2146 testNativeBubblingEventWithoutTargetListener — everything except
	// the innermost pair.
	expect(exercise(cfg, { withTargetListener: false })).toEqual([
		'outer parent capture',
		'outer capture',
		'inner parent capture',
		'inner parent',
		'outer',
		'outer parent',
	]);

	// Per :2302 testReactStopPropagationInOuterCapturePhase — stops at the outer
	// capture handler; the target's raw native listener never hears the event.
	expect(
		exercise(cfg, { stopAt: 'outer capture' }, [{ at: '.target', label: 'inner (native)' }]),
	).toEqual(['outer parent capture', 'outer capture']);

	// Per :2365 testReactStopPropagationInInnerCapturePhase.
	expect(
		exercise(cfg, { stopAt: 'inner parent capture' }, [{ at: '.target', label: 'inner (native)' }]),
	).toEqual(['outer parent capture', 'outer capture', 'inner parent capture']);

	// Per :2429 testReactStopPropagationInInnerBubblePhase — capture phase is
	// unaffected, the target's bubble handler fires and stops the walk.
	// (React's version also plants a raw listener on `outer` and expects silence;
	// in a single-root setup that listener sits BELOW the delegation root, so the
	// native event reaches it before the framework's bubble dispatch — the raw
	// listener half only pins React's two-copies layout and is dropped.)
	expect(exercise(cfg, { stopAt: 'inner' })).toEqual([...CAPTURES, 'inner']);

	// Per :2495 testReactStopPropagationInOuterBubblePhase.
	expect(exercise(cfg, { stopAt: 'outer' })).toEqual([
		...CAPTURES,
		'inner',
		'inner parent',
		'outer',
	]);

	// Per :2552 testNativeStopPropagationInOuterCapturePhase — a raw capture
	// listener on the outer-parent ELEMENT stops the event. The delegation root
	// (the container) sits above it, so every framework capture handler has
	// already fired; no bubble handler runs. (React's printed log shows only the
	// outer copy's captures — a two-copies artifact; a single React root behaves
	// exactly like this.)
	expect(
		exercise(cfg, {}, [
			{ at: '.outer-parent', label: 'outer parent capture (native)', capture: true, stop: true },
		]),
	).toEqual([...CAPTURES, 'outer parent capture (native)']);

	// Per :2620 testNativeStopPropagationInInnerCapturePhase — identical shape to
	// React's printed log: all captures already dispatched at the root, then the
	// raw capture listener on `parent` stops the descent, so no bubble handlers.
	expect(
		exercise(cfg, {}, [
			{ at: '.parent', label: 'inner parent capture (native)', capture: true, stop: true },
		]),
	).toEqual([...CAPTURES, 'inner parent capture (native)']);

	// Per :2690 testNativeStopPropagationInInnerBubblePhase — the target's raw
	// bubble listener fires first in the bubble phase and stops the event before
	// it reaches the delegation root: no framework bubble handler runs.
	expect(exercise(cfg, {}, [{ at: '.target', label: 'inner (native)', stop: true }])).toEqual([
		...CAPTURES,
		'inner (native)',
	]);

	// Per :2828 testNativeStopPropagationInOuterBubblePhase — a raw bubble
	// listener on `outer` stops the event below the delegation root, so NO
	// framework bubble handler fires (React's printed log additionally shows the
	// inner copy's two bubble handlers because that copy's root sat below
	// `outer` — two-copies artifact; a single React root fires none, like this).
	expect(exercise(cfg, {}, [{ at: '.outer', label: 'outer (native)', stop: true }])).toEqual([
		...CAPTURES,
		'outer (native)',
	]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Events that bubble in React and in the browser (describe 'bubbling events').
// One `it` per source case, each running the full 10-scenario battery.
// ─────────────────────────────────────────────────────────────────────────────

const NATIVE_BUBBLING: EventConfig[] = [
	{ react: 'AnimationEnd', line: 59, native: 'animationend', dispatch: plainEvent('animationend') },
	{
		react: 'AnimationIteration',
		line: 76,
		native: 'animationiteration',
		dispatch: plainEvent('animationiteration'),
	},
	{
		react: 'AnimationStart',
		line: 93,
		native: 'animationstart',
		dispatch: plainEvent('animationstart'),
	},
	{ react: 'AuxClick', line: 110, native: 'auxclick', dispatch: mouseEvent('auxclick') },
	{ react: 'Click', line: 147, native: 'click', dispatch: (n) => (n as HTMLElement).click() },
	{ react: 'ContextMenu', line: 159, native: 'contextmenu', dispatch: mouseEvent('contextmenu') },
	{ react: 'Copy', line: 176, native: 'copy', dispatch: plainEvent('copy') },
	{ react: 'Cut', line: 193, native: 'cut', dispatch: plainEvent('cut') },
	{ react: 'DoubleClick', line: 210, native: 'dblclick', dispatch: mouseEvent('dblclick') },
	{ react: 'Drag', line: 227, native: 'drag', dispatch: mouseEvent('drag') },
	{ react: 'DragEnd', line: 244, native: 'dragend', dispatch: mouseEvent('dragend') },
	{ react: 'DragEnter', line: 261, native: 'dragenter', dispatch: mouseEvent('dragenter') },
	{ react: 'DragExit', line: 278, native: 'dragexit', dispatch: mouseEvent('dragexit') },
	{ react: 'DragLeave', line: 295, native: 'dragleave', dispatch: mouseEvent('dragleave') },
	{ react: 'DragOver', line: 312, native: 'dragover', dispatch: mouseEvent('dragover') },
	{ react: 'DragStart', line: 329, native: 'dragstart', dispatch: mouseEvent('dragstart') },
	{ react: 'Drop', line: 346, native: 'drop', dispatch: mouseEvent('drop') },
	{
		react: 'GotPointerCapture',
		line: 379,
		native: 'gotpointercapture',
		dispatch: plainEvent('gotpointercapture'),
	},
	{ react: 'KeyDown', line: 396, native: 'keydown', type: 'input', dispatch: keyEvent('keydown') },
	{
		react: 'KeyPress',
		line: 413,
		native: 'keypress',
		type: 'input',
		dispatch: keyEvent('keypress', { keyCode: 13 } as any),
	},
	{ react: 'KeyUp', line: 431, native: 'keyup', type: 'input', dispatch: keyEvent('keyup') },
	{
		react: 'LostPointerCapture',
		line: 448,
		native: 'lostpointercapture',
		dispatch: plainEvent('lostpointercapture'),
	},
	{ react: 'MouseDown', line: 465, native: 'mousedown', dispatch: mouseEvent('mousedown') },
	{ react: 'MouseOut', line: 482, native: 'mouseout', dispatch: mouseEvent('mouseout') },
	{ react: 'MouseOver', line: 499, native: 'mouseover', dispatch: mouseEvent('mouseover') },
	{ react: 'MouseUp', line: 516, native: 'mouseup', dispatch: mouseEvent('mouseup') },
	{ react: 'Paste', line: 533, native: 'paste', dispatch: plainEvent('paste') },
	{
		react: 'PointerCancel',
		line: 550,
		native: 'pointercancel',
		dispatch: plainEvent('pointercancel'),
	},
	{ react: 'PointerDown', line: 567, native: 'pointerdown', dispatch: plainEvent('pointerdown') },
	{ react: 'PointerMove', line: 584, native: 'pointermove', dispatch: plainEvent('pointermove') },
	{ react: 'PointerOut', line: 601, native: 'pointerout', dispatch: plainEvent('pointerout') },
	{ react: 'PointerOver', line: 618, native: 'pointerover', dispatch: plainEvent('pointerover') },
	{ react: 'PointerUp', line: 635, native: 'pointerup', dispatch: plainEvent('pointerup') },
	{ react: 'Reset', line: 652, native: 'reset', type: 'form', dispatch: plainEvent('reset') },
	{ react: 'Submit', line: 668, native: 'submit', type: 'form', dispatch: plainEvent('submit') },
	{ react: 'TouchCancel', line: 684, native: 'touchcancel', dispatch: plainEvent('touchcancel') },
	{ react: 'TouchEnd', line: 701, native: 'touchend', dispatch: plainEvent('touchend') },
	{ react: 'TouchMove', line: 718, native: 'touchmove', dispatch: plainEvent('touchmove') },
	{ react: 'TouchStart', line: 735, native: 'touchstart', dispatch: plainEvent('touchstart') },
	{
		react: 'TransitionRun',
		line: 752,
		native: 'transitionrun',
		dispatch: ev({ bubbles: true, cancelable: false })('transitionrun'),
	},
	{
		react: 'TransitionStart',
		line: 769,
		native: 'transitionstart',
		dispatch: ev({ bubbles: true, cancelable: false })('transitionstart'),
	},
	{
		react: 'TransitionCancel',
		line: 786,
		native: 'transitioncancel',
		dispatch: ev({ bubbles: true, cancelable: false })('transitioncancel'),
	},
	{
		react: 'TransitionEnd',
		line: 803,
		native: 'transitionend',
		dispatch: ev({ bubbles: true, cancelable: false })('transitionend'),
	},
	{ react: 'Wheel', line: 820, native: 'wheel', dispatch: plainEvent('wheel') },
	// From the 'polyfilled events' section: React synthesizes onComposition* through
	// its polyfill plumbing but the DISPATCHED events are the real composition
	// events, which bubble — for octane they are ordinary delegated native events
	// and run the full battery. (Only the polyfill internals diverge.)
	{
		react: 'CompositionStart',
		line: 1688,
		native: 'compositionstart',
		type: 'input',
		dispatch: ev({ bubbles: true })('compositionstart'),
	},
	{
		react: 'CompositionEnd',
		line: 1750,
		native: 'compositionend',
		type: 'input',
		dispatch: ev({ bubbles: true })('compositionend'),
	},
	{
		react: 'CompositionUpdate',
		line: 1812,
		native: 'compositionupdate',
		type: 'input',
		dispatch: ev({ bubbles: true })('compositionupdate'),
	},
];

describe('bubbling events — capture root→target then bubble target→root, stopPropagation at every level', () => {
	for (const cfg of NATIVE_BUBBLING) {
		// Per ReactDOMEventPropagation-test.js:<line> — on<Event> (10-scenario battery).
		it(`on${cfg.react} (line ${cfg.line})`, () => {
			assertNativeBubblingEvent(cfg);
		});
	}
});

// ─────────────────────────────────────────────────────────────────────────────
// onFocus / onBlur — React's bubbling matrix drives them via the BUBBLING
// focusin/focusout natives. Octane instead capture-delegates the non-bubbling
// focus/blur natives and walks the ancestor chain, reproducing the same
// bubbling-onFocus contract (tests/focus-events.test.ts pins the basic walk).
// The bubble-phase half matches React order-for-order; the combined
// capture+bubble ordering is a pinned gap.
// ─────────────────────────────────────────────────────────────────────────────

const FOCUS: EventConfig = {
	react: 'Focus',
	line: 363,
	native: 'focus',
	type: 'input',
	dispatch: (n) => n.dispatchEvent(new FocusEvent('focus', { bubbles: false })),
};
const BLUR: EventConfig = {
	react: 'Blur',
	line: 127,
	native: 'blur',
	type: 'input',
	dispatch: (n) => n.dispatchEvent(new FocusEvent('blur', { bubbles: false })),
};

describe('onFocus/onBlur — emulated bubbling of the non-bubbling focus/blur natives', () => {
	// Per ReactDOMEventPropagation-test.js:363 (onFocus) — bubble handlers fire
	// target→root exactly like React's focusin-driven onFocus.
	it('onFocus walks target→root (line 363)', () => {
		expect(exercise(FOCUS, { phases: 'bubble' })).toEqual(BUBBLES);
	});

	// Per ReactDOMEventPropagation-test.js:127 (onBlur).
	it('onBlur walks target→root (line 127)', () => {
		expect(exercise(BLUR, { phases: 'bubble' })).toEqual(BUBBLES);
	});

	// Per :2429 testReactStopPropagationInInnerBubblePhase adapted to focus —
	// stopPropagation inside the emulated walk halts it.
	it('stopPropagation at the target halts the onFocus walk (line 363 + :2429)', () => {
		expect(exercise(FOCUS, { phases: 'bubble', stopAt: 'inner' })).toEqual(['inner']);
	});

	it('onFocusCapture fires root→target (line 363 capture half)', () => {
		expect(exercise(FOCUS, { phases: 'capture' })).toEqual(CAPTURES);
	});

	// Per :1973 testNativeBubblingEventWithTargetListener applied to onFocus —
	// all captures fire root→target before any bubble handler.
	it('onFocus fires captures before bubbles when both are present (line 363 + :1973)', () => {
		expect(exercise(FOCUS)).toEqual(FULL);
	});

	it('onBlur fires captures before bubbles when both are present (line 127 + :1973)', () => {
		expect(exercise(BLUR)).toEqual(FULL);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 'non-bubbling events that bubble in React' (lines 838-1368).
//
// React attaches these directly to elements and re-dispatches along the React
// tree. Octane capture-delegates the native event, then walks the logical tree so
// target and ancestor handlers observe the same capture→bubble order.
// ─────────────────────────────────────────────────────────────────────────────

const EMULATED_BUBBLING: EventConfig[] = [
	{ react: 'Abort', line: 839, native: 'abort', type: 'video', dispatch: nonBubbling('abort') },
	{ react: 'Cancel', line: 855, native: 'cancel', type: 'dialog', dispatch: nonBubbling('cancel') },
	{
		react: 'CanPlay',
		line: 871,
		native: 'canplay',
		type: 'video',
		dispatch: nonBubbling('canplay'),
	},
	{
		react: 'CanPlayThrough',
		line: 887,
		native: 'canplaythrough',
		type: 'video',
		dispatch: nonBubbling('canplaythrough'),
	},
	{ react: 'Close', line: 903, native: 'close', type: 'dialog', dispatch: nonBubbling('close') },
	{
		react: 'DurationChange',
		line: 919,
		native: 'durationchange',
		type: 'video',
		dispatch: nonBubbling('durationchange'),
	},
	{
		react: 'Emptied',
		line: 935,
		native: 'emptied',
		type: 'video',
		dispatch: nonBubbling('emptied'),
	},
	{
		react: 'Encrypted',
		line: 951,
		native: 'encrypted',
		type: 'video',
		dispatch: nonBubbling('encrypted'),
	},
	{ react: 'Ended', line: 967, native: 'ended', type: 'video', dispatch: nonBubbling('ended') },
	{ react: 'Error', line: 983, native: 'error', type: 'img', dispatch: nonBubbling('error') },
	{ react: 'Load', line: 1015, native: 'load', type: 'img', dispatch: nonBubbling('load') },
	{
		react: 'LoadedData',
		line: 1031,
		native: 'loadeddata',
		type: 'video',
		dispatch: nonBubbling('loadeddata'),
	},
	{
		react: 'LoadedMetadata',
		line: 1047,
		native: 'loadedmetadata',
		type: 'video',
		dispatch: nonBubbling('loadedmetadata'),
	},
	{
		react: 'LoadStart',
		line: 1063,
		native: 'loadstart',
		type: 'video',
		dispatch: nonBubbling('loadstart'),
	},
	{ react: 'Pause', line: 1079, native: 'pause', type: 'video', dispatch: nonBubbling('pause') },
	{ react: 'Play', line: 1095, native: 'play', type: 'video', dispatch: nonBubbling('play') },
	{
		react: 'Playing',
		line: 1111,
		native: 'playing',
		type: 'video',
		dispatch: nonBubbling('playing'),
	},
	{
		react: 'Progress',
		line: 1127,
		native: 'progress',
		type: 'video',
		dispatch: nonBubbling('progress'),
	},
	{
		react: 'RateChange',
		line: 1143,
		native: 'ratechange',
		type: 'video',
		dispatch: nonBubbling('ratechange'),
	},
	{ react: 'Resize', line: 1159, native: 'resize', type: 'video', dispatch: nonBubbling('resize') },
	{ react: 'Seeked', line: 1175, native: 'seeked', type: 'video', dispatch: nonBubbling('seeked') },
	{
		react: 'Seeking',
		line: 1191,
		native: 'seeking',
		type: 'video',
		dispatch: nonBubbling('seeking'),
	},
	{
		react: 'Stalled',
		line: 1207,
		native: 'stalled',
		type: 'video',
		dispatch: nonBubbling('stalled'),
	},
	{
		react: 'Suspend',
		line: 1223,
		native: 'suspend',
		type: 'video',
		dispatch: nonBubbling('suspend'),
	},
	{
		react: 'TimeUpdate',
		line: 1239,
		native: 'timeupdate',
		type: 'video',
		dispatch: nonBubbling('timeupdate'),
	},
	{
		react: 'Toggle',
		line: 1255,
		native: 'toggle',
		type: 'details',
		dispatch: nonBubbling('toggle'),
	},
	{
		react: 'BeforeToggle',
		line: 1271,
		native: 'beforetoggle',
		targetExtra: { popover: 'any' },
		dispatch: nonBubbling('beforetoggle'),
	},
	// line 1288 'onToggle Popover API'
	{
		react: 'Toggle',
		line: 1288,
		native: 'toggle',
		targetExtra: { popover: 'any' },
		dispatch: nonBubbling('toggle'),
	},
	// line 1305/1321 Dialog API
	{
		react: 'BeforeToggle',
		line: 1305,
		native: 'beforetoggle',
		type: 'dialog',
		dispatch: nonBubbling('beforetoggle'),
	},
	{
		react: 'Toggle',
		line: 1321,
		native: 'toggle',
		type: 'dialog',
		dispatch: nonBubbling('toggle'),
	},
	{
		react: 'VolumeChange',
		line: 1337,
		native: 'volumechange',
		type: 'video',
		dispatch: nonBubbling('volumechange'),
	},
	{
		react: 'Waiting',
		line: 1353,
		native: 'waiting',
		type: 'video',
		dispatch: nonBubbling('waiting'),
	},
];

describe('non-bubbling events that bubble in React', () => {
	for (const cfg of EMULATED_BUBBLING) {
		const label = `on${cfg.react}${cfg.targetExtra ? ' (popover)' : cfg.type === 'dialog' && cfg.react.includes('Toggle') ? ' (dialog)' : ''} (line ${cfg.line})`;

		// Per ReactDOMEventPropagation-test.js:<line> via :2030
		// testEmulatedBubblingEventWithTargetListener — capture handlers run
		// root→target, then bubble handlers run target→root.
		it(`${label} — captures then bubbles through the logical tree`, () => {
			expect(exercise(cfg)).toEqual(FULL);
		});

		// Per the same source case, capture half — the platform capture phase
		// visits every ancestor even for non-bubbling events, so on<Event>Capture
		// fires root→target exactly like React's log prefix.
		it(`${label} — capture handlers fire root→target`, () => {
			expect(exercise(cfg, { phases: 'capture' })).toEqual(CAPTURES);
		});

		// Per :2218 testEmulatedBubblingEventWithoutTargetListener — delegation
		// still reaches ancestors when the target itself has no handler.
		it(`${label} — reaches ancestor handlers without a target listener`, () => {
			expect(exercise(cfg, { withTargetListener: false, phases: 'bubble' })).toEqual([
				'inner parent',
				'outer',
				'outer parent',
			]);
		});

		it(`${label} — stopPropagation halts the emulated bubble walk`, () => {
			expect(exercise(cfg, { phases: 'bubble', stopAt: 'inner parent' })).toEqual([
				'inner',
				'inner parent',
			]);
		});
	}
});

// ─────────────────────────────────────────────────────────────────────────────
// onInvalid — a form's onInvalid observes its controls through the same
// capture-delegated logical ancestor walk.
// ─────────────────────────────────────────────────────────────────────────────

const INVALID: EventConfig = {
	react: 'Invalid',
	line: 999,
	native: 'invalid',
	type: 'input',
	dispatch: nonBubbling('invalid'),
};

describe('onInvalid — emulated bubbling (line 999)', () => {
	// Per ReactDOMEventPropagation-test.js:999 via :2030 — the emulated bubble
	// walks the whole logical ancestor chain, target→root.
	it('walks target→root like React', () => {
		expect(exercise(INVALID, { phases: 'bubble' })).toEqual(BUBBLES);
	});

	it('onInvalidCapture fires root→target', () => {
		expect(exercise(INVALID, { phases: 'capture' })).toEqual(CAPTURES);
	});

	// Per :2429 adapted — stopPropagation mid-walk halts the emulated bubble.
	it('stopPropagation halts the walk mid-chain', () => {
		expect(exercise(INVALID, { phases: 'bubble', stopAt: 'inner parent' })).toEqual([
			'inner',
			'inner parent',
		]);
	});

	it('fires captures before bubbles when both are present (:2030 order)', () => {
		expect(exercise(INVALID)).toEqual(FULL);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 'non-bubbling events that do not bubble in React' (lines 1370-1402):
// onScroll / onScrollEnd — target-only in React 17+ and in octane.
// ─────────────────────────────────────────────────────────────────────────────

const SCROLL: EventConfig = {
	react: 'Scroll',
	line: 1371,
	native: 'scroll',
	dispatch: nonBubbling('scroll'),
};
const SCROLL_END: EventConfig = {
	react: 'ScrollEnd',
	line: 1387,
	native: 'scrollend',
	dispatch: nonBubbling('scrollend'),
};

describe('non-bubbling events that do not bubble in React — onScroll/onScrollEnd', () => {
	for (const cfg of [SCROLL, SCROLL_END]) {
		// Per ReactDOMEventPropagation-test.js:<line> via :2090
		// testNonBubblingEventWithTargetListener — the target handler fires and
		// nothing propagates to ancestors (tests/enter-leave-events.test.ts pins
		// the 2-level version; this is the 4-level port).
		it(`on${cfg.react} fires on the target only (line ${cfg.line})`, () => {
			expect(exercise(cfg, { phases: 'bubble' })).toEqual(['inner']);
		});

		// Capture half of the same case — root→target.
		it(`on${cfg.react}Capture fires root→target (line ${cfg.line})`, () => {
			expect(exercise(cfg, { phases: 'capture' })).toEqual(CAPTURES);
		});

		// Per :2090's combined log `[...captures, '---- inner']`.
		it(`on${cfg.react} captures fire before the target handler (line ${cfg.line} + :2090)`, () => {
			expect(exercise(cfg)).toEqual([...CAPTURES, 'inner']);
		});
	}
});

// ─────────────────────────────────────────────────────────────────────────────
// 'enter/leave events' (lines 1408-1554) — outcome-level port.
//
// React SYNTHESIZES onMouseEnter/Leave and onPointerEnter/Leave from
// mouseover/mouseout (pointerover/out) pairs — a synthetic-layer mechanism and
// an intentional octane divergence (skip block up top). The PLATFORM fires real
// per-element enter/leave events with the same common-ancestor semantics:
// outermost→innermost on enter, innermost→outermost on leave. jsdom does not
// derive enter/leave from over/out, so these dispatch the exact per-element
// sequence a browser would, and assert octane's per-element (target-only)
// delivery reproduces React's logged order. (Octane's order also has no
// "separate traversal per root" wart — the React test's own comment calls its
// two-root order "not ideal"; the single-instance order below is the ideal one.)
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_SELECTORS = ['.outer-parent', '.outer', '.parent', '.target'] as const;
const LEVEL_LABELS = ['outer parent', 'outer', 'inner parent', 'inner'] as const;

function mountEnterLeave(react: 'Mouse' | 'Pointer', log: string[]) {
	const props: any = { targetProps: {}, parentProps: {}, outerProps: {}, outerParentProps: {} };
	const keys = ['outerParentProps', 'outerProps', 'parentProps', 'targetProps'];
	keys.forEach((k, i) => {
		props[k]['on' + react + 'Enter'] = () => log.push(LEVEL_LABELS[i] + ' enter');
		props[k]['on' + react + 'Leave'] = () => log.push(LEVEL_LABELS[i] + ' leave');
	});
	return mount(Levels as any, props);
}

// PointerEvent may be missing in jsdom — enter/leave dispatch only needs the
// type + non-bubbling flag, so fall back to MouseEvent.
const pointerish = (type: string) =>
	typeof PointerEvent !== 'undefined'
		? new PointerEvent(type, { bubbles: false })
		: new MouseEvent(type, { bubbles: false });

describe('enter/leave events — per-element native delivery (lines 1409, 1482 adapted)', () => {
	// Per ReactDOMEventPropagation-test.js:1409 (onMouseEnter and onMouseLeave).
	it('onMouseEnter fires outermost→innermost, onMouseLeave innermost→outermost', () => {
		const log: string[] = [];
		const r = mountEnterLeave('Mouse', log);
		// UA enter sequence for a pointer arriving from outside onto the target:
		for (const sel of LEVEL_SELECTORS) {
			r.find(sel).dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
		}
		expect(log).toEqual(['outer parent enter', 'outer enter', 'inner parent enter', 'inner enter']);
		log.length = 0;
		// UA leave sequence for the pointer moving off to <body>:
		for (const sel of [...LEVEL_SELECTORS].reverse()) {
			r.find(sel).dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
		}
		expect(log).toEqual(['inner leave', 'inner parent leave', 'outer leave', 'outer parent leave']);
		r.unmount();
	});

	// Per ReactDOMEventPropagation-test.js:1482 (onPointerEnter and onPointerLeave).
	it('onPointerEnter fires outermost→innermost, onPointerLeave innermost→outermost', () => {
		const log: string[] = [];
		const r = mountEnterLeave('Pointer', log);
		for (const sel of LEVEL_SELECTORS) {
			r.find(sel).dispatchEvent(pointerish('pointerenter'));
		}
		expect(log).toEqual(['outer parent enter', 'outer enter', 'inner parent enter', 'inner enter']);
		log.length = 0;
		for (const sel of [...LEVEL_SELECTORS].reverse()) {
			r.find(sel).dispatchEvent(pointerish('pointerleave'));
		}
		expect(log).toEqual(['inner leave', 'inner parent leave', 'outer leave', 'outer parent leave']);
		r.unmount();
	});

	// Documentation of the intentional divergence: octane does NOT derive
	// enter/leave from over/out (React's synthesis inputs, lines 1451/1467) — the
	// platform's real per-element events are the contract. Dispatching the
	// synthesis INPUTS therefore fires nothing.
	it('mouseover/mouseout do not trigger enter/leave handlers (no synthesis — intentional divergence)', () => {
		const log: string[] = [];
		const r = mountEnterLeave('Mouse', log);
		r.find('.target').dispatchEvent(
			new MouseEvent('mouseover', { bubbles: true, cancelable: true, relatedTarget: null }),
		);
		r.find('.target').dispatchEvent(
			new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: document.body }),
		);
		expect(log).toEqual([]);
		r.unmount();
	});
});
