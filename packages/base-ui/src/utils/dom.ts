// Small DOM type-guards (Base UI uses `@floating-ui/utils/dom`'s isElement/isHTMLElement). jsdom
// and normal DOM are single-realm here, so `instanceof` is sufficient.
export function isElement(value: unknown): value is Element {
	return value != null && value instanceof Element;
}

export function isHTMLElement(value: unknown): value is HTMLElement {
	return value != null && value instanceof HTMLElement;
}
