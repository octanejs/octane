// Ported from .base-ui/packages/react/src/floating-ui-react/utils/element.ts (matchesFocusVisible).
// jsdom doesn't match `:focus-visible` reliably (it stays matched while `:focus` is set), so —
// exactly as Base UI does — return `true` under jsdom to avoid the focus-restore dance. Both the
// octane and React trees run in the SAME jsdom in the differential rig, so this must agree.
const isJSDOM = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);

export function matchesFocusVisible(element: Element | null): boolean {
	if (!element || isJSDOM) {
		return true;
	}
	try {
		return element.matches(':focus-visible');
	} catch {
		return true;
	}
}
