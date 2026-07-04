// Ported from .base-ui/packages/utils/src/visuallyHidden.ts — the screen-reader-only
// style object (a plain CSS-in-JS object; octane serializes it at the apply site).
const visuallyHiddenBase: Record<string, any> = {
	clipPath: 'inset(50%)',
	overflow: 'hidden',
	whiteSpace: 'nowrap',
	border: 0,
	padding: 0,
	width: 1,
	height: 1,
	margin: -1,
};

export const visuallyHidden: Record<string, any> = {
	...visuallyHiddenBase,
	position: 'fixed',
	top: 0,
	left: 0,
};

export const visuallyHiddenInput: Record<string, any> = {
	...visuallyHiddenBase,
	position: 'absolute',
};
