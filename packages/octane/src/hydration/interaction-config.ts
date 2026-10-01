export const HYDRATE_INTERACTION_EVENTS_ATTR = 'data-octane-hydrate-interaction-events';
export const HYDRATE_SELECTION_ATTR = 'data-octane-hydrate-selection';

export const EARLY_HYDRATION_INTENTS_KEY = '__octaneEarlyHydrationIntents';
export const EARLY_HYDRATION_INTENTS_LIMIT = 256;

// Events every capture document listens for. A dynamic marker treats any of
// them as conservative intent, so the pointer lifecycle events below stay out.
export const HYDRATE_SUPPORTED_INTERACTION_EVENTS = [
	'auxclick',
	'beforeinput',
	'click',
	'compositionend',
	'compositionstart',
	'compositionupdate',
	'contextmenu',
	'dblclick',
	'focusin',
	'input',
	'keydown',
	'keyup',
	'mousedown',
	'mouseenter',
	'mouseover',
	'mouseup',
	'pointerdown',
	'pointerenter',
	'pointerover',
	'pointerup',
	'touchend',
	'touchstart',
] as const;

/**
 * Opt-in pointer lifecycle events extend intent that another selected event
 * already captured, so a hydrated press handler can tell whether the pointer
 * moved or the browser cancelled it. They never start hydration or prefetch on
 * their own, which lets capture listen for them only after such a boundary has
 * captured intent.
 */
export const HYDRATE_LIFECYCLE_INTERACTION_EVENTS = ['pointercancel', 'pointermove'] as const;

export function isHydrationLifecycleEvent(type: string): boolean {
	return (HYDRATE_LIFECYCLE_INTERACTION_EVENTS as readonly string[]).includes(type);
}

export const HYDRATE_NATIVE_DEFAULT_INTERACTION_EVENTS: readonly string[] = [
	'beforeinput',
	'compositionend',
	'compositionstart',
	'compositionupdate',
	'input',
	'mousedown',
	'pointerdown',
	'pointermove',
	'pointerup',
	'touchend',
	'touchstart',
];

export const HYDRATE_DEFAULT_INTERACTION_EVENTS = [
	'pointerenter',
	'focusin',
	'pointerdown',
	'touchstart',
	'touchend',
	'beforeinput',
	'input',
	'compositionstart',
	'compositionupdate',
	'compositionend',
	'click',
] as const;
