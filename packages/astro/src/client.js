import { createElement, createRoot, hydrateRoot } from 'octane';
import { slotName } from './slot-name.js';
import { staticHtmlElement } from './static-html.js';

/** @type {WeakMap<HTMLElement, import('octane').Root>} */
const rootMap = new WeakMap();

/**
 * @param {HTMLElement} element
 * @param {() => import('octane').Root} creator
 * @returns {{ root: import('octane').Root; created: boolean }}
 */
function getOrCreateRoot(element, creator) {
	let root = rootMap.get(element);
	if (!root) {
		root = creator();
		rootMap.set(element, root);
		return { root, created: true };
	}
	return { root, created: false };
}

/**
 * @param {HTMLElement} element
 */
export default (element) =>
	/**
	 * @param {any} Component
	 * @param {Record<string, any>} props
	 * @param {Record<string, any>} slotted
	 * @param {{ client: string }} meta
	 */
	(Component, props, { default: children, ...slotted }, { client }) => {
		if (!element.hasAttribute('ssr')) return;

		for (const [key, value] of Object.entries(slotted)) {
			const name = slotName(key);
			props[name] = staticHtmlElement(createElement, { value, name });
		}

		if (children != null) {
			props.children = staticHtmlElement(createElement, { value: children });
		}

		const prefix = element.getAttribute('prefix') ?? '';

		if (client === 'only') {
			// Do not clear `innerHTML` here. Astro re-invokes this hydrator on
			// prop refreshes (e.g. transition:persist); wiping would destroy nodes
			// the live Octane root still owns. First `root.render` already clears
			// leftover fallback/slot markup via createRoot's mount path.
			const { root } = getOrCreateRoot(element, () => {
				const r = createRoot(element);
				element.addEventListener('astro:unmount', () => r.unmount(), { once: true });
				return r;
			});
			root.render(Component, props);
			return;
		}

		const { root, created } = getOrCreateRoot(element, () => {
			const r = hydrateRoot(element, Component, props, {
				identifierPrefix: prefix,
			});
			element.addEventListener('astro:unmount', () => r.unmount(), { once: true });
			return r;
		});
		// hydrateRoot already applied the initial tree; only re-render on refresh.
		if (!created) {
			root.render(Component, props);
		}
	};
