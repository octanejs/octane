/**
 * Astro passes slot children as an HTML string. Wrap them in `astro-slot` /
 * `astro-static-slot` with Octane's React-shape `dangerouslySetInnerHTML`.
 *
 * @param {(type: any, props?: any, ...children: any[]) => any} createElement
 * @param {{ value: string | null | undefined; name?: string; hydrate?: boolean }} options
 */
export function staticHtmlElement(createElement, { value, name, hydrate = true }) {
	if (value == null || String(value).trim() === '') return null;
	const tagName = hydrate ? 'astro-slot' : 'astro-static-slot';
	const props = {
		dangerouslySetInnerHTML: { __html: value },
	};
	if (name != null && name !== '') {
		props.name = name;
	}
	return createElement(tagName, props);
}
