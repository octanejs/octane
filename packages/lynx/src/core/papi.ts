/** Opaque Element PAPI reference owned by the Lynx main thread. */
export type LynxElementRef = object;

/**
 * Structural slice of the public Element PAPI used by the Milestone 2 host.
 *
 * `@lynx-js/types` does not publish these declarations. Keeping the injected
 * surface local avoids pulling the ambient `@lynx-js/type-element-api` globals
 * into either the background bundle or Octane's JSX namespace.
 */
export interface LynxElementPAPIGlobals<Node extends LynxElementRef = LynxElementRef> {
	__CreatePage(componentId: string, cssId: number): Node;
	__CreateElement(type: string, parentComponentUniqueId: number): Node;
	__CreateView(parentComponentUniqueId: number): Node;
	__CreateScrollView(parentComponentUniqueId: number): Node;
	__CreateText(parentComponentUniqueId: number): Node;
	__CreateRawText(text: string): Node;
	__CreateImage(parentComponentUniqueId: number): Node;
	__GetElementUniqueID(node: Node): number;
	__GetParent?(node: Node): Node | null | undefined;
	__ElementIsEqual?(first: Node, second: Node): boolean;
	__InsertElementBefore(parent: Node, child: Node, before?: Node): unknown;
	__RemoveElement(parent: Node, child: Node): unknown;
	__ReplaceElement(replacement: Node, previous: Node): void;
	__SetAttribute(node: Node, name: string, value: unknown): void;
	__SetID(node: Node, id: string | null): void;
	__FlushElementTree(node?: Node): void;
}

/** Normalized, dependency-injected Element PAPI used by the root-scoped host. */
export interface LynxElementPAPI<Node extends LynxElementRef = LynxElementRef> {
	createPage(componentId: string, cssId: number): Node;
	createElement(type: string, parentComponentUniqueId: number, text: string): Node;
	getUniqueId(node: Node): number;
	isChild(parent: Node, child: Node): boolean;
	insertBefore(parent: Node, child: Node, before: Node | null): void;
	remove(parent: Node, child: Node): void;
	replace(replacement: Node, previous: Node): void;
	setAttribute(node: Node, name: string, value: unknown): void;
	setId(node: Node, id: string | null): void;
	flush(page: Node): void;
}

function requireFunction<
	Node extends LynxElementRef,
	Name extends keyof LynxElementPAPIGlobals<Node>,
>(target: object, name: Name): LynxElementPAPIGlobals<Node>[Name] {
	const value = (target as Record<PropertyKey, unknown>)[name];
	if (typeof value !== 'function') {
		throw new Error(`Octane Lynx requires the public Element PAPI function ${String(name)}.`);
	}
	return value.bind(target) as LynxElementPAPIGlobals<Node>[Name];
}

/**
 * Capture the public Element PAPI from an explicit main-thread global object.
 * The returned adapter contains no mutable renderer or root state.
 */
export function createLynxElementPAPI<Node extends LynxElementRef = LynxElementRef>(
	target: object = globalThis,
): LynxElementPAPI<Node> {
	const createPage = requireFunction<Node, '__CreatePage'>(target, '__CreatePage');
	const createElement = requireFunction<Node, '__CreateElement'>(target, '__CreateElement');
	const createView = requireFunction<Node, '__CreateView'>(target, '__CreateView');
	const createScrollView = requireFunction<Node, '__CreateScrollView'>(
		target,
		'__CreateScrollView',
	);
	const createText = requireFunction<Node, '__CreateText'>(target, '__CreateText');
	const createRawText = requireFunction<Node, '__CreateRawText'>(target, '__CreateRawText');
	const createImage = requireFunction<Node, '__CreateImage'>(target, '__CreateImage');
	const getUniqueId = requireFunction<Node, '__GetElementUniqueID'>(target, '__GetElementUniqueID');
	const getParentValue = (target as LynxElementPAPIGlobals<Node>).__GetParent;
	const elementIsEqualValue = (target as LynxElementPAPIGlobals<Node>).__ElementIsEqual;
	const getParent = typeof getParentValue === 'function' ? getParentValue.bind(target) : undefined;
	const elementIsEqual =
		typeof elementIsEqualValue === 'function' ? elementIsEqualValue.bind(target) : undefined;
	const hasTestingParentFallback =
		(target as { lynxTestingEnv?: unknown }).lynxTestingEnv !== undefined;
	if (getParent !== undefined && elementIsEqual === undefined) {
		throw new Error(
			'Octane Lynx requires the public Element PAPI function __ElementIsEqual when __GetParent is available.',
		);
	}
	if (getParent === undefined && !hasTestingParentFallback) {
		throw new Error(
			'Octane Lynx requires the public Element PAPI function __GetParent for retry-safe cleanup.',
		);
	}
	const insertBefore = requireFunction<Node, '__InsertElementBefore'>(
		target,
		'__InsertElementBefore',
	);
	const remove = requireFunction<Node, '__RemoveElement'>(target, '__RemoveElement');
	const replace = requireFunction<Node, '__ReplaceElement'>(target, '__ReplaceElement');
	const setAttribute = requireFunction<Node, '__SetAttribute'>(target, '__SetAttribute');
	const setId = requireFunction<Node, '__SetID'>(target, '__SetID');
	const flush = requireFunction<Node, '__FlushElementTree'>(target, '__FlushElementTree');

	const papi: LynxElementPAPI<Node> = {
		createPage(componentId, cssId) {
			return createPage(componentId, cssId);
		},
		createElement(type, parentComponentUniqueId, textValue) {
			switch (type) {
				case '#text':
				case 'raw-text':
					return createRawText(textValue);
				case 'view':
					return createView(parentComponentUniqueId);
				case 'scroll-view':
					return createScrollView(parentComponentUniqueId);
				case 'text':
					return createText(parentComponentUniqueId);
				case 'image':
					return createImage(parentComponentUniqueId);
				default:
					return createElement(type, parentComponentUniqueId);
			}
		},
		getUniqueId(node) {
			return getUniqueId(node);
		},
		isChild(parent, child) {
			if (getParent !== undefined) {
				const actualParent = getParent(child);
				return actualParent != null && elementIsEqual!(actualParent, parent);
			}
			// @lynx-js/testing-environment@0.3.0 models ElementRefs as DOM nodes,
			// but does not expose the public parent-inspection primitives.
			if (
				hasTestingParentFallback &&
				child !== null &&
				typeof child === 'object' &&
				'parentNode' in child
			) {
				return (child as { parentNode: unknown }).parentNode === parent;
			}
			return false;
		},
		insertBefore(parent, child, before) {
			insertBefore(parent, child, before ?? undefined);
		},
		remove(parent, child) {
			remove(parent, child);
		},
		replace(replacement, previous) {
			replace(replacement, previous);
		},
		setAttribute(node, name, value) {
			setAttribute(node, name, value);
		},
		setId(node, id) {
			setId(node, id);
		},
		flush(page) {
			flush(page);
		},
	};
	return Object.freeze(papi);
}
