// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/keyboard.tsx).
// Verbatim (no React surface); the upstream file carries a .tsx extension but contains no JSX.
import { isMac } from './platform';

interface Event {
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
}

export function isCtrlKeyPressed(e: Event): boolean {
	if (isMac()) {
		return e.metaKey;
	}

	return e.ctrlKey;
}

// HTML input types that do not cause the software keyboard to appear.
const nonTextInputTypes = new Set([
	'checkbox',
	'radio',
	'range',
	'color',
	'file',
	'image',
	'button',
	'submit',
	'reset',
]);

export function willOpenKeyboard(target: Element): boolean {
	return (
		(target instanceof HTMLInputElement && !nonTextInputTypes.has(target.type)) ||
		target instanceof HTMLTextAreaElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}
