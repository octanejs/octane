import { createRoot, flushSync } from 'octane';
import { afterEach } from 'vitest';

interface TestNode {
	type: string;
	props: Record<string, unknown>;
	children: Array<TestNode | string> | null;
}

function styleObject(element: HTMLElement): Record<string, string> {
	const style: Record<string, string> = {};
	for (const property of Array.from(element.style)) {
		const camelCase = property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
		style[camelCase] = element.style.getPropertyValue(property);
	}
	for (const shorthand of ['background', 'border', 'margin', 'padding']) {
		if (!(shorthand in style)) continue;
		for (const key of Object.keys(style)) {
			if (key !== shorthand && key.startsWith(shorthand)) delete style[key];
		}
	}
	return style;
}

function serialize(element: Element): TestNode {
	const props: Record<string, unknown> = {};
	for (const attribute of Array.from(element.attributes)) {
		if (attribute.name === 'style') continue;
		props[attribute.name === 'class' ? 'className' : attribute.name] = attribute.value;
	}
	if (element.hasAttribute('style')) props.style = styleObject(element as HTMLElement);

	const children = Array.from(element.childNodes).flatMap((child) => {
		if (child.nodeType === Node.TEXT_NODE) return [child.nodeValue ?? ''];
		if (child.nodeType === Node.ELEMENT_NODE) return [serialize(child as Element)];
		return [];
	});
	return { type: element.localName, props, children: children.length > 0 ? children : null };
}

const mounted = new Set<ReturnType<typeof createRoot>>();
afterEach(() => {
	for (const root of mounted) root.unmount();
	mounted.clear();
});

function create(element: unknown) {
	const container = document.createElement('div');
	const root = createRoot(container);
	mounted.add(root);
	flushSync(() => root.render(element));
	return {
		toJSON(): TestNode | TestNode[] | null {
			const nodes = Array.from(container.children).map(serialize);
			return nodes.length === 0 ? null : nodes.length === 1 ? nodes[0] : nodes;
		},
		unmount() {
			root.unmount();
			mounted.delete(root);
		},
	};
}

export default { create };
