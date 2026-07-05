// Ported from .base-ui/packages/react/src/floating-ui-react/utils/constants.ts. Marks a popup as
// programmatically focusable (the focus manager + composite navigation look for it).
export const FOCUSABLE_ATTRIBUTE = 'data-base-ui-focusable';

export const TYPEABLE_SELECTOR =
	"input:not([type='hidden']):not([disabled])," +
	"[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";
