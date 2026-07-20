import { LYNX_NODES_REF_ATTRIBUTE } from './nodes-ref.js';

/** Opaque Element PAPI reference owned by the Lynx main thread. */
export type LynxElementRef = object;

/** Native list callback invoked when Lynx requests one logical cell. */
export type LynxListComponentAtIndex<Node extends LynxElementRef = LynxElementRef> = (
	list: Node,
	listId: number,
	index: number,
	operationId?: number,
	enableReuseNotification?: boolean,
) => number;

/** Batched variant used by newer Lynx engines. */
export type LynxListComponentAtIndexes<Node extends LynxElementRef = LynxElementRef> = (
	list: Node,
	listId: number,
	indexes: readonly number[],
	operationIds: readonly number[],
	enableReuseNotification?: boolean,
	asyncFlush?: boolean,
) => void;

/** Native list callback invoked when a physical cell may enter the reuse pool. */
export type LynxListEnqueueComponent<Node extends LynxElementRef = LynxElementRef> = (
	list: Node,
	listId: number,
	sign: number,
) => void;

/** The public Element PAPI list slice, kept optional until a list is authored. */
export interface LynxListPAPI<Node extends LynxElementRef = LynxElementRef> {
	create(
		parentComponentUniqueId: number,
		componentAtIndex: LynxListComponentAtIndex<Node>,
		enqueueComponent: LynxListEnqueueComponent<Node>,
		componentAtIndexes: LynxListComponentAtIndexes<Node>,
	): Node;
	updateCallbacks(
		list: Node,
		componentAtIndex: LynxListComponentAtIndex<Node>,
		enqueueComponent: LynxListEnqueueComponent<Node>,
		componentAtIndexes: LynxListComponentAtIndexes<Node>,
	): void;
	updateComponents(list: Node, components: readonly string[]): void;
}

/**
 * Structural slice of the public Element PAPI used by the Milestone 3 host.
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
	__CreateList?(
		parentComponentUniqueId: number,
		componentAtIndex: LynxListComponentAtIndex<Node>,
		enqueueComponent: LynxListEnqueueComponent<Node>,
		options?: Readonly<Record<string, unknown>>,
		componentAtIndexes?: LynxListComponentAtIndexes<Node>,
	): Node;
	__UpdateListCallbacks?(
		list: Node,
		componentAtIndex: LynxListComponentAtIndex<Node>,
		enqueueComponent: LynxListEnqueueComponent<Node>,
		componentAtIndexes?: LynxListComponentAtIndexes<Node>,
	): void;
	__UpdateListComponents?(list: Node, components: readonly string[]): void;
	__GetElementUniqueID(node: Node): number;
	__GetParent?(node: Node): Node | null | undefined;
	__ElementIsEqual?(first: Node, second: Node): boolean;
	__InsertElementBefore(parent: Node, child: Node, before?: Node): unknown;
	__RemoveElement(parent: Node, child: Node): unknown;
	__ReplaceElement(replacement: Node, previous: Node): void;
	__SetClasses(node: Node, value: string): void;
	__SetInlineStyles(node: Node, value: string | Readonly<Record<string, string>>): void;
	__SetCSSId(node: Node | readonly Node[], id: number, entryName?: string): void;
	__SetAttribute(node: Node, name: string, value: unknown): void;
	__SetDataset(node: Node, value: Readonly<Record<string, unknown>>): void;
	__AddEvent(node: Node, kind: string, name: string, listener: string | undefined): void;
	__SetID(node: Node, id: string | null): void;
	__FlushElementTree(node?: Node, options?: Readonly<Record<string, unknown>>): void;
}

/** Normalized, dependency-injected Element PAPI used by the root-scoped host. */
export interface LynxElementPAPI<Node extends LynxElementRef = LynxElementRef> {
	createPage(componentId: string, cssId: number): Node;
	createElement(type: string, parentComponentUniqueId: number, text: string): Node;
	/** Present when the runtime publishes the native list callback API. */
	readonly list?: LynxListPAPI<Node>;
	getUniqueId(node: Node): number;
	isChild(parent: Node, child: Node): boolean;
	insertBefore(parent: Node, child: Node, before: Node | null): void;
	remove(parent: Node, child: Node): void;
	replace(replacement: Node, previous: Node): void;
	setClasses(node: Node, value: string): void;
	setInlineStyles(node: Node, value: string | Readonly<Record<string, string>>): void;
	setCssId(node: Node, id: number, entryName?: string): void;
	setAttribute(node: Node, name: string, value: unknown): void;
	setRefSelector(node: Node, value: string): void;
	setDataset(node: Node, value: Readonly<Record<string, unknown>>): void;
	setEvent(node: Node, kind: string, name: string, listener: string | undefined): void;
	setId(node: Node, id: string | null): void;
	flush(node: Node, options?: Readonly<Record<string, unknown>>): void;
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
	const listGlobals = target as LynxElementPAPIGlobals<Node>;
	const createListValue = listGlobals.__CreateList;
	const updateListCallbacksValue = listGlobals.__UpdateListCallbacks;
	const updateListComponentsValue = listGlobals.__UpdateListComponents;
	const listFunctionCount = [
		createListValue,
		updateListCallbacksValue,
		updateListComponentsValue,
	].filter((value) => typeof value === 'function').length;
	if (listFunctionCount !== 0 && listFunctionCount !== 3) {
		throw new Error(
			'Octane Lynx requires __CreateList, __UpdateListCallbacks, and __UpdateListComponents together.',
		);
	}
	const list =
		listFunctionCount === 3
			? Object.freeze({
					create(
						parentComponentUniqueId: number,
						componentAtIndex: LynxListComponentAtIndex<Node>,
						enqueueComponent: LynxListEnqueueComponent<Node>,
						componentAtIndexes: LynxListComponentAtIndexes<Node>,
					) {
						return createListValue!.call(
							target,
							parentComponentUniqueId,
							componentAtIndex,
							enqueueComponent,
							{},
							componentAtIndexes,
						);
					},
					updateCallbacks(
						listNode: Node,
						componentAtIndex: LynxListComponentAtIndex<Node>,
						enqueueComponent: LynxListEnqueueComponent<Node>,
						componentAtIndexes: LynxListComponentAtIndexes<Node>,
					) {
						updateListCallbacksValue!.call(
							target,
							listNode,
							componentAtIndex,
							enqueueComponent,
							componentAtIndexes,
						);
					},
					updateComponents(listNode: Node, components: readonly string[]) {
						updateListComponentsValue!.call(target, listNode, components);
					},
				})
			: undefined;
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
	const setClasses = requireFunction<Node, '__SetClasses'>(target, '__SetClasses');
	const setInlineStyles = requireFunction<Node, '__SetInlineStyles'>(target, '__SetInlineStyles');
	const setCssId = requireFunction<Node, '__SetCSSId'>(target, '__SetCSSId');
	const setAttribute = requireFunction<Node, '__SetAttribute'>(target, '__SetAttribute');
	const setDataset = requireFunction<Node, '__SetDataset'>(target, '__SetDataset');
	const addEvent = requireFunction<Node, '__AddEvent'>(target, '__AddEvent');
	const setId = requireFunction<Node, '__SetID'>(target, '__SetID');
	const flush = requireFunction<Node, '__FlushElementTree'>(target, '__FlushElementTree');

	const papi: LynxElementPAPI<Node> = {
		...(list === undefined ? null : { list }),
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
		setClasses(node, value) {
			setClasses(node, value);
		},
		setInlineStyles(node, value) {
			setInlineStyles(node, value);
		},
		setCssId(node, id, entryName) {
			setCssId(node, id, entryName);
		},
		setAttribute(node, name, value) {
			setAttribute(node, name, value);
		},
		setRefSelector(node, value) {
			setAttribute(node, LYNX_NODES_REF_ATTRIBUTE, value);
		},
		setDataset(node, value) {
			setDataset(node, value);
		},
		setEvent(node, kind, name, listener) {
			addEvent(node, kind, name, listener);
		},
		setId(node, id) {
			// The pinned public declaration and ReactLynx removal path both use
			// null. Keep the production adapter exact even though the JavaScript
			// testing environment models this operation as a DOM assignment.
			setId(node, id);
		},
		flush(node, options) {
			flush(node, options);
		},
	};
	return Object.freeze(papi);
}
