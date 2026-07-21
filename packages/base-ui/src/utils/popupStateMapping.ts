// Ported from .base-ui/packages/react/src/utils/popupStateMapping.ts (v1.6.0). Maps popup/trigger
// `open` (+ transition/anchor) state → the shared `data-*` attributes. Pure.
import type { StateAttributesMapping } from './getStateAttributesProps';

export const CommonPopupDataAttributes = {
	open: 'data-open',
	closed: 'data-closed',
	startingStyle: 'data-starting-style',
	endingStyle: 'data-ending-style',
	anchorHidden: 'data-anchor-hidden',
	side: 'data-side',
	align: 'data-align',
} as const;

export const CommonTriggerDataAttributes = {
	popupOpen: 'data-popup-open',
	pressed: 'data-pressed',
} as const;

const TRIGGER_HOOK = { [CommonTriggerDataAttributes.popupOpen]: '' };
const PRESSABLE_TRIGGER_HOOK = {
	[CommonTriggerDataAttributes.popupOpen]: '',
	[CommonTriggerDataAttributes.pressed]: '',
};
const POPUP_OPEN_HOOK = { [CommonPopupDataAttributes.open]: '' };
const POPUP_CLOSED_HOOK = { [CommonPopupDataAttributes.closed]: '' };
const ANCHOR_HIDDEN_HOOK = { [CommonPopupDataAttributes.anchorHidden]: '' };

export const triggerOpenStateMapping: StateAttributesMapping<{ open: boolean }> = {
	open(value: boolean) {
		return value ? TRIGGER_HOOK : null;
	},
};

export const pressableTriggerOpenStateMapping: StateAttributesMapping<{ open: boolean }> = {
	open(value: boolean) {
		return value ? PRESSABLE_TRIGGER_HOOK : null;
	},
};

export const popupStateMapping = {
	open(value: boolean) {
		return value ? POPUP_OPEN_HOOK : POPUP_CLOSED_HOOK;
	},
	anchorHidden(value: boolean) {
		return value ? ANCHOR_HIDDEN_HOOK : null;
	},
} satisfies StateAttributesMapping<{ open: boolean; anchorHidden: boolean }>;
