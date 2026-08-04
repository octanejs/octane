// Ported from .base-ui/packages/react/src/utils/collapsibleOpenStateMapping.ts (v1.6.0).
//
// NAME COLLISION, upstream's not ours: Base UI exports `triggerOpenStateMapping` from BOTH
// this module and `utils/popupStateMapping.ts`, and they emit DIFFERENT attributes —
// `data-panel-open` here versus `data-popup-open` there. Each consumer imports the one it
// means, and the collapsible trigger means this one. This package puts one util per file, so
// the collapsible variant is renamed rather than shadowing the popup export: importing the
// wrong one is a silent attribute swap that only a rendered-DOM assertion would catch.
import type { StateAttributesMapping } from './getStateAttributesProps';

// CollapsiblePanelDataAttributes.open / .closed
const PANEL_OPEN_HOOK = { 'data-open': '' };
const PANEL_CLOSED_HOOK = { 'data-closed': '' };

// CollapsibleTriggerDataAttributes.panelOpen
const TRIGGER_PANEL_OPEN_HOOK = { 'data-panel-open': '' };

/** The panel/root mapping: `data-open` when open, `data-closed` when not. */
export const collapsibleOpenStateMapping: StateAttributesMapping<{ open: boolean }> = {
	open(value: boolean) {
		return value ? PANEL_OPEN_HOOK : PANEL_CLOSED_HOOK;
	},
};

/** Upstream's `triggerOpenStateMapping` from this module: `data-panel-open`, or nothing. */
export const collapsibleTriggerOpenStateMapping: StateAttributesMapping<{ open: boolean }> = {
	open(value: boolean) {
		return value ? TRIGGER_PANEL_OPEN_HOOK : null;
	},
};
