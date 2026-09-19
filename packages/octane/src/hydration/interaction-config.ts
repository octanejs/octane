export const HYDRATE_INTERACTION_EVENTS_ATTR = 'data-octane-hydrate-interaction-events';
export const HYDRATE_SELECTION_ATTR = 'data-octane-hydrate-selection';

export const EARLY_HYDRATION_INTENTS_KEY = '__octaneEarlyHydrationIntents';
export const EARLY_HYDRATION_INTENTS_LIMIT = 256;

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

export const HYDRATE_NATIVE_DEFAULT_INTERACTION_EVENTS: readonly string[] = [
	'beforeinput',
	'compositionend',
	'compositionstart',
	'compositionupdate',
	'input',
	'mousedown',
	'pointerdown',
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
