import { cloneElement, createElement, Fragment, type OctaneNode } from 'octane';

const tagRe = /<([a-zA-Z0-9]+)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9]+)\/>/;

const voidElementTags: Record<string, boolean> = {
	area: true,
	base: true,
	br: true,
	col: true,
	embed: true,
	hr: true,
	img: true,
	input: true,
	keygen: true,
	link: true,
	meta: true,
	param: true,
	source: true,
	track: true,
	wbr: true,
	menuitem: true,
};

type FormatTree = string | OctaneNode | Array<OctaneNode | string>;

function formatElements(value: string, elements: { [key: string]: OctaneNode } = {}): FormatTree {
	const parts = value.split(tagRe);
	if (parts.length === 1) return value;

	const uniqueId = makeCounter(0, '$lingui$');

	const tree: Array<OctaneNode | string> = [];

	const before = parts.shift();
	if (before) tree.push(before);

	const nodes = getElements(parts);
	for (let i = 0; i < nodes.length; i++) {
		const [index, children, after] = nodes[i]!;
		let element = typeof index !== 'undefined' ? elements[index] : undefined;

		if (!element || (isVoidHost(element) && children)) {
			if (!element) {
				console.error(
					`Can't use element at index '${index}' as it is not declared in the original translation`,
				);
			} else {
				console.error(
					`${getElementType(element)} is a void element tag therefore it must have no children`,
				);
			}

			element = createElement(Fragment, null);
		}

		if (Array.isArray(element)) {
			element = createElement(Fragment, null, element);
		}

		tree.push(
			cloneElement(
				element as Parameters<typeof cloneElement>[0],
				{ key: uniqueId() },
				children
					? formatElements(children, elements)
					: (element as { props?: { children?: OctaneNode } }).props?.children,
			),
		);

		if (after) tree.push(after);
	}

	return tree.length === 1 ? tree[0]! : tree;
}

function isVoidHost(element: OctaneNode): boolean {
	const type = getElementType(element);
	return typeof type === 'string' && voidElementTags[type] === true;
}

function getElementType(element: OctaneNode): unknown {
	if (element != null && typeof element === 'object' && 'type' in element) {
		return (element as { type: unknown }).type;
	}
	return undefined;
}

function getElements(parts: string[]): Array<readonly [string, string, string]> {
	if (!parts.length) return [];

	const paired = parts[0];
	const children = parts[1];
	const unpaired = parts[2];
	const after = parts[3];

	const triple: readonly [string, string, string] = [
		paired || unpaired || '',
		children || '',
		after || '',
	];
	return [triple].concat(getElements(parts.slice(4, parts.length)));
}

function makeCounter(count = 0, prefix = '') {
	return function nextId() {
		const id = `${prefix}_${count++}`;
		return id;
	};
}

export { formatElements };
