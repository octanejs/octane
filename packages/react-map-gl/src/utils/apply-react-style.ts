import type { CSSProperties } from '../types/octane';
// This is a simplified version of
// https://github.com/facebook/react/blob/4131af3e4bf52f3a003537ec95a1655147c81270/src/renderers/dom/shared/CSSPropertyOperations.js#L62
const unitlessNumber = /box|flex|grid|column|lineHeight|fontWeight|opacity|order|tabSize|zIndex/;

// Ported from upstream src/utils/apply-react-style.ts. The only change is the
// style type: upstream annotates it `React.CSSProperties`. The name is kept
// because it is the upstream module name, not a claim about React.
export function applyReactStyle(
	element: HTMLElement | undefined,
	styles: CSSProperties | undefined,
): void {
	if (!element || !styles) {
		return;
	}
	const style = element.style;

	for (const key in styles) {
		const value = (styles as Record<string, unknown>)[key];
		if (Number.isFinite(value) && !unitlessNumber.test(key)) {
			(style as unknown as Record<string, unknown>)[key] = `${value}px`;
		} else {
			(style as unknown as Record<string, unknown>)[key] = value;
		}
	}
}
