import { createElement, createRoot, hydrateRoot } from 'octane';
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
			props[key] = staticHtmlElement(createElement, { value, name: key });
		}

		if (children != null) {
			props.children = staticHtmlElement(createElement, { value: children });
		}

		const prefix = element.getAttribute('prefix') ?? '';

		if (client === 'only') {
			element.innerHTML = '';
			const { root, created } = getOrCreateRoot(element, () => {
				const r = createRoot(element);
				element.addEventListener('astro:unmount', () => r.unmount(), { once: true });
				return r;
			});
			root.render(Component, props);
			void created;
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
