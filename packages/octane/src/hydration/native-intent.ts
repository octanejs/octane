import type { EarlyHydrationIntent } from './control-capture.js';

export const NATIVE_HYDRATION_CAPTURE_KEY = '__octaneNativeHydrationCapture';

/** @internal Parser-installed features preserve native activation before client opt-in. */
export interface NativeHydrationCapture {
	skip(event: Event): boolean;
	/** The opted parser preserves adjacency even after command custody is discarded. */
	next?: () => number;
	push?: (intent: EarlyHydrationIntent) => void;
}

export function getNativeHydrationCapture(document: Document): NativeHydrationCapture | undefined {
	return (document as Document & { [NATIVE_HYDRATION_CAPTURE_KEY]?: NativeHydrationCapture })[
		NATIVE_HYDRATION_CAPTURE_KEY
	];
}

/** @internal Native accessors cannot be shadowed by form controls with DOM names. */
export interface NativeHydrationDOM {
	element(value: unknown): value is Element;
	owner(node: Node): Document | null;
	parent(node: Node): Element | null;
	connected(node: Node): boolean;
	kind(node: Node): number;
	contains(container: Element, node: Node): boolean;
	matches(element: Element, selector: string): boolean;
	query(element: Element, selector: string): NodeListOf<Element>;
	closest(element: Element, selector: string): Element | null;
	attribute(element: Element, name: string): string | null;
	children(element: Element): HTMLCollection;
	target(event: Event): Element | null;
}

let nativeDOMs: WeakMap<Document, NativeHydrationDOM> | undefined;

function nodePrototype(node: object): Node {
	let prototype = Object.getPrototypeOf(node);
	while (Object.getOwnPropertyDescriptor(prototype, 'ownerDocument') === undefined) {
		prototype = Object.getPrototypeOf(prototype);
	}
	return prototype;
}

/** @internal Resolve the container's realm before its named properties can interfere. */
export function getNativeHydrationDocument(value: unknown): Document | null {
	if (typeof value !== 'object' || value === null) return null;
	try {
		const prototype = nodePrototype(value);
		return Object.getOwnPropertyDescriptor(prototype, 'nodeType')!.get!.call(value) === 1
			? Object.getOwnPropertyDescriptor(prototype, 'ownerDocument')!.get!.call(value)
			: null;
	} catch {
		return null;
	}
}

/** @internal Created only for explicitly enabled native capture, once per document. */
export function getNativeHydrationDOM(document: Document): NativeHydrationDOM {
	let dom = nativeDOMs?.get(document);
	if (dom !== undefined) return dom;
	const prototype = document.defaultView?.Node.prototype ?? nodePrototype(document);
	const owner = Object.getOwnPropertyDescriptor(prototype, 'ownerDocument')!.get!;
	const parent = Object.getOwnPropertyDescriptor(prototype, 'parentElement')!.get!;
	const connected = Object.getOwnPropertyDescriptor(prototype, 'isConnected')!.get!;
	const kind = Object.getOwnPropertyDescriptor(prototype, 'nodeType')!.get!;
	const elementPrototype = (document.defaultView?.Element ?? globalThis.Element).prototype;
	const children = Object.getOwnPropertyDescriptor(elementPrototype, 'children')!.get!;
	const element = (value: unknown): value is Element => {
		try {
			return kind.call(value) === 1;
		} catch {
			return false;
		}
	};
	dom = {
		element,
		owner: (node) => owner.call(node),
		parent: (node) => parent.call(node),
		connected: (node) => connected.call(node),
		kind: (node) => kind.call(node),
		contains: (container, node) =>
			owner.call(node) === document && elementPrototype.contains.call(container, node),
		matches: (node, selector) => elementPrototype.matches.call(node, selector),
		query: (node, selector) => elementPrototype.querySelectorAll.call(node, selector),
		closest: (node, selector) => elementPrototype.closest.call(node, selector),
		attribute: (node, name) => elementPrototype.getAttribute.call(node, name),
		children: (node) => children.call(node),
		target: (event) => {
			if (event.target === null) return null;
			try {
				return kind.call(event.target) === 1
					? (event.target as Element)
					: parent.call(event.target);
			} catch {
				return null;
			}
		},
	};
	(nativeDOMs ??= new WeakMap()).set(document, dom);
	return dom;
}
