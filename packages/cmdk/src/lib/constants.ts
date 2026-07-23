// The cmdk DOM contract: attribute selectors consumers style against and the
// port queries, the native selection event name, the value attribute, and the
// screen-reader-only style for the hidden accessibility label.

export const GROUP_SELECTOR = `[cmdk-group=""]`;
export const GROUP_ITEMS_SELECTOR = `[cmdk-group-items=""]`;
export const GROUP_HEADING_SELECTOR = `[cmdk-group-heading=""]`;
export const ITEM_SELECTOR = `[cmdk-item=""]`;
export const VALID_ITEM_SELECTOR = `${ITEM_SELECTOR}:not([aria-disabled="true"])`;
export const SELECT_EVENT = `cmdk-item-select`;
export const VALUE_ATTR = `data-value`;

export const srOnlyStyles = {
	position: 'absolute',
	width: '1px',
	height: '1px',
	padding: '0',
	margin: '-1px',
	overflow: 'hidden',
	clip: 'rect(0, 0, 0, 0)',
	whiteSpace: 'nowrap',
	borderWidth: '0',
} as const;
