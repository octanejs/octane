import { createElement, createRoot, hydrateRoot } from 'octane';
import { slotName } from './slot-name.js';
import StaticHtml from './static-html-client.js';

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
 * Unmount and drop the WeakMap entry so a later hydrate on the same element
 * creates a fresh root instead of calling `render` on a dead one.
 *
 * @param {HTMLElement} element
 * @param {import('octane').Root} root
 */
function attachUnmount(element, root) {
	element.addEventListener(
		'astro:unmount',
		() => {
			root.unmount();
			rootMap.delete(element);
		},
		{ once: true },
	);
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
			props[name] = createElement(StaticHtml, { value, name });
		}

		if (children != null) {
			props.children = createElement(StaticHtml, { value: children });
		}

		const prefix = element.getAttribute('prefix') ?? '';

		if (client === 'only') {
			// Do not clear `innerHTML` here. Astro re-invokes this hydrator on
			// prop refreshes (e.g. transition:persist); wiping would destroy nodes
			// the live Octane root still owns. First `root.render` already clears
			// leftover fallback/slot markup via createRoot's mount path.
			const { root } = getOrCreateRoot(element, () => {
				const r = createRoot(element);
				attachUnmount(element, r);
				return r;
			});
			root.render(Component, props);
			return;
		}

		const { root, created } = getOrCreateRoot(element, () => {
			const r = hydrateRoot(element, Component, props, {
				identifierPrefix: prefix,
			});
			attachUnmount(element, r);
			return r;
		});
		// hydrateRoot already applied the initial tree; only re-render on refresh.
		if (!created) {
			root.render(Component, props);
		}
	};
