// Known JSX event props use Octane's delegated native event path. Custom
// elements route all other on* props to case-sensitive addEventListener calls.
// Keep this list shared by direct compiler bindings and runtime prop spreads.
const names =
	'Abort AnimationEnd AnimationIteration AnimationStart AuxClick BeforeInput BeforeToggle Blur Cancel CanPlay CanPlayThrough Change Click Close CompositionEnd CompositionStart CompositionUpdate ContextMenu Copy Cut DoubleClick Drag DragEnd DragEnter DragExit DragLeave DragOver DragStart Drop DurationChange Emptied Encrypted Ended Error Focus GotPointerCapture Input Invalid KeyDown KeyPress KeyUp Load LoadedData LoadedMetadata LoadStart LostPointerCapture MouseDown MouseEnter MouseLeave MouseMove MouseOut MouseOver MouseUp Paste Pause Play Playing PointerCancel PointerDown PointerEnter PointerLeave PointerMove PointerOut PointerOver PointerUp Progress RateChange Reset Resize Scroll ScrollEnd Seeked Seeking Select Stalled Submit Suspend TimeUpdate Toggle TouchCancel TouchEnd TouchMove TouchStart TransitionCancel TransitionEnd TransitionRun TransitionStart VolumeChange Waiting Wheel';
let delegatedEventProps;

/** Whether a prop is a recognized delegated JSX event rather than a custom event. */
export function isDelegatedEventProp(name) {
	if (delegatedEventProps === undefined) {
		delegatedEventProps = new Set();
		for (const event of names.split(' ')) {
			delegatedEventProps.add('on' + event);
			delegatedEventProps.add('on' + event + 'Capture');
		}
	}
	return delegatedEventProps.has(name);
}

// Shared by the compiler and dynamic runtime registration. Event names are
// already normalized by their caller; custom event names remain case-sensitive.
export const EVENT_BUBBLE = 1;
export const EVENT_CAPTURE = 2;
export const EVENT_NATIVE_CAPTURE = 4;
export const EVENT_TARGET_ONLY = 8;
export const EVENT_DISCRETE = 16;
export const EVENT_RESTORE = 32;
export const EVENT_DISABLED_MOUSE = 64;
export const EVENT_DISABLED_ENTER = 128;
export const EVENT_CUSTOM_NATIVE_ONLY = 256;

// Non-bubbling events must be delegated in the CAPTURE phase so the single root
// listener still sees them (the capture phase reaches the root even when the event
// doesn't bubble). For focus/blur the dispatcher then walks from `event.target`
// upward, which reproduces React's bubbling `onFocus`/`onBlur`. (All other events
// keep the cheaper bubbling-phase delegation.) The flag must match between
// add/removeEventListener, so registration stores this category on the shared type.
// The remaining NON-BUBBLING native families (media/resource lifecycle,
// <details>/<dialog> state events, resize). A bubble-phase root listener cannot
// hear them, so listen in capture and emulate React's target→root propagation in
// dispatchDelegated. This lets an ancestor onPlay/onToggle/onLoad observe an
// event from its descendant without installing a direct listener on every host.
const EMULATED_BUBBLING_EVENTS = [
	'abort',
	'beforetoggle',
	'cancel',
	'canplay',
	'canplaythrough',
	'close',
	'durationchange',
	'emptied',
	'encrypted',
	'ended',
	'error',
	'load',
	'loadeddata',
	'loadedmetadata',
	'loadstart',
	'pause',
	'play',
	'playing',
	'progress',
	'ratechange',
	'resize',
	'seeked',
	'seeking',
	'stalled',
	'suspend',
	'timeupdate',
	'toggle',
	'volumechange',
	'waiting',
];

const CAPTURE_DELEGATED = /* @__PURE__ */ new Set([
	'focus',
	'blur',
	// `invalid` doesn't bubble either, but React's onInvalid propagates (a form's
	// onInvalid observes its controls' invalid events) — so it gets the focus/blur
	// walking treatment, NOT the enter/leave target-only one.
	'invalid',
	'pointerenter',
	'pointerleave',
	'mouseenter',
	'mouseleave',
	// Element `scroll`/`scrollend` don't bubble either. React 17+ made onScroll
	// NON-bubbling (it fires only on the scrolled element), so they get the
	// enter/leave target-only treatment below.
	'scroll',
	'scrollend',
	...EMULATED_BUBBLING_EVENTS,
]);
// The enter/leave family is dispatched PER ELEMENT by the browser — each
// entered/left element receives its OWN non-bubbling event — so the delegated
// dispatcher must fire ONLY the target's handler. Ascending the ancestor chain
// (the focus/blur treatment) would double-fire ancestors, which receive their own
// enter/leave events natively. Matches React, where the enter/leave events do not
// bubble either.
const TARGET_ONLY_DELEGATED = /* @__PURE__ */ new Set([
	'pointerenter',
	'pointerleave',
	'mouseenter',
	'mouseleave',
	// React 17+ parity: onScroll fires on the scrolled element only (no synthetic
	// bubbling), and ancestors receive their own scroll events natively.
	'scroll',
	'scrollend',
]);

/**
 * Event types whose outermost delegated dispatch is a commit boundary. React's
 * `batchedUpdates` (react-dom-bindings ReactDOMUpdateBatching.js) flushes sync
 * work at the end of the outermost event handler ONLY when a controlled
 * form control has a pending state restore; every other discrete update lands
 * in the sync-lane microtask. Octane follows the same policy (maybeFlushDiscrete):
 * a dispatch that armed a controlled restore commits synchronously so the
 * restore compares the DOM against the values the handlers just rendered, and
 * any other handler-scheduled work keeps the ordinary microtask batch. For a
 * browser-dispatched event the microtask checkpoint runs before the next native
 * listener and before the default action, so later listeners still observe
 * committed state; a script-dispatched event (dispatchEvent, click(),
 * requestSubmit()) commits only after the dispatching script yields, exactly
 * as React does. Updates still batch inside a handler: setState followed by a
 * DOM read does not observe the update without an explicit flushSync.
 *
 * Based on facebook/react packages/react-dom-bindings/src/events/
 * ReactDOMEventListener.js — getEventPriority. React's priority classification
 * is separate from its sync-lane microtask flush boundary.
 */
const DISCRETE_EVENTS = /* @__PURE__ */ new Set([
	'auxclick',
	'beforeblur',
	'beforeinput',
	'blur',
	'cancel',
	'change',
	'click',
	'close',
	'compositionend',
	'compositionstart',
	'compositionupdate',
	'contextmenu',
	'copy',
	'cut',
	'dblclick',
	'dragend',
	'dragstart',
	'drop',
	'focus',
	'focusin',
	'focusout',
	'fullscreenchange',
	'gotpointercapture',
	'hashchange',
	'input',
	'invalid',
	'keydown',
	'keypress',
	'keyup',
	'lostpointercapture',
	'mousedown',
	'mouseup',
	'paste',
	'pause',
	'play',
	'pointercancel',
	'pointerdown',
	'pointerup',
	'popstate',
	'ratechange',
	'reset',
	'resize',
	'seeked',
	'select',
	'selectionchange',
	'selectstart',
	'submit',
	'textInput',
	'touchcancel',
	'touchend',
	'touchstart',
	'volumechange',
]);

/**
 * Events whose dispatch can carry a user edit to a form control — React's
 * ChangeEventPlugin extraction set. Armed elements targeted by one of these
 * are restored after the discrete flush. `click` is delegated (a checkable's
 * edit STARTS there) but never ARMS the restore itself: the platform toggles
 * a checkable before its click dispatch, then fires `input`/`change` AFTER
 * it (activation post-steps) — and octane handlers are native, so they run
 * in those later dispatches. Restoring after the click flush would revert
 * the toggle before any handler could read or commit it (React avoids this
 * only because its synthetic onChange runs during the click); the follow-up
 * input/change arms the restore at the right time, and a NON-toggling click
 * (preventDefault, re-clicking a checked radio) fires no follow-up and
 * leaves no drift to restore.
 */
export const RESTORE_EVENT_LIST = ['input', 'change', 'click'];
const RESTORE_EVENTS = /* @__PURE__ */ new Set(RESTORE_EVENT_LIST);

/** Immutable category bits; bubble/capture registration bits are separate. */
export function delegatedEventFlags(name) {
	return (
		(CAPTURE_DELEGATED.has(name) ? EVENT_NATIVE_CAPTURE : 0) |
		(TARGET_ONLY_DELEGATED.has(name) ? EVENT_TARGET_ONLY : 0) |
		(DISCRETE_EVENTS.has(name) ? EVENT_DISCRETE : 0) |
		(RESTORE_EVENTS.has(name) ? EVENT_RESTORE : 0) |
		(name === 'click' ||
		name === 'dblclick' ||
		name === 'mousedown' ||
		name === 'mousemove' ||
		name === 'mouseup'
			? EVENT_DISABLED_MOUSE
			: 0) |
		(name === 'mouseenter' ? EVENT_DISABLED_ENTER : 0) |
		(name === 'invalid' || EMULATED_BUBBLING_EVENTS.includes(name) ? EVENT_CUSTOM_NATIVE_ONLY : 0)
	);
}
