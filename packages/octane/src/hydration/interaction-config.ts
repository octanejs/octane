export const HYDRATE_INTERACTION_EVENTS_ATTR = 'data-octane-hydrate-interaction-events';

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
