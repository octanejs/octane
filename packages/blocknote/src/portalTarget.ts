// Independently authored Octane adapter for the public @blocknote/react 0.53.0 API.
/** Where floating UI portals mount: an element, a CSS selector, or `null` for `document.body`. */
export type PortalTarget = HTMLElement | string | null;

export type PortalElementsMap = {
	default?: PortalTarget;
};

/**
 * Resolve a public portal target to the element `editor.mount` expects.
 * `undefined` yields `null`, which lets `mount` pick its own default.
 */
export function resolvePortalTarget(target: PortalTarget | undefined): HTMLElement | null {
	if (target === undefined || typeof document === 'undefined') {
		return null;
	}

	if (target === null) {
		return document.body;
	}

	if (typeof target !== 'string') {
		return target;
	}

	const element = document.querySelector<HTMLElement>(target);
	if (element === null) {
		console.warn(
			`@octanejs/blocknote: portal target "${target}" matched no element; using the default portal target.`,
		);
	}
	return element;
}
