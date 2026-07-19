// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/collections/CollectionBuilder.tsx).
// octane adaptations (docs/aria-migration-plan.md §2a — the detached-real-DOM
// collection host):
// - The hidden structural copy renders through `Hidden` via octane
//   `createPortal` into the Document's DETACHED real container (upstream:
//   a React portal into the fake Document). `CollectionRoot` therefore does
//   not portal again — its subtree is already inside the hidden portal — it
//   only flips the contexts (doc → null so nested Collections render inline,
//   shallow → the Document so leaf/branch wrappers render placeholders).
// - `ShallowRenderContext` carries the owning `Document` instead of upstream's
//   boolean: real placeholder elements have no `ownerDocument` back-pointer to
//   the store (upstream's fake elements do), so the ref-registration callback
//   reads the Document from context. `isShallow` ≙ `doc != null`.
// - Leaf/branch placeholder refs register `(NodeClass, props, rendered,
//   render)` through `Document.setElementProps` — the user-visible JSX is
//   cached on the node (`rendered`/`render`), NOT rendered in the hidden tree,
//   exactly upstream's contract.
// - React 16/17 useSyncExternalStore shim fallback dropped (octane's native
//   useSyncExternalStore supports getServerSnapshot).
// - `.tsx` → `.ts` (JSX → createElement), no forwardRef (octane refs are
//   props), S()/subSlot slot conventions; hooks may sit behind conditions
//   (octane hooks are slot-keyed, so upstream's rules-of-hooks escape comments
//   collapse away).
// - SSR follows upstream's render-phase in-order registration path against the
//   Document's lightweight SSR tree. PHASE-8: SSR/hydration coverage deferred.
import type { Key, Node } from '@react-types/shared';
import {
	Fragment,
	createContext,
	createElement,
	useCallback,
	useContext,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'octane';
import { BaseCollection, CollectionNode } from './BaseCollection';
import { Document, ElementNode } from './Document';
import { CachedChildrenOptions, useCachedChildren } from './useCachedChildren';
import { FocusableContext } from '../interactions/useFocusable';
import { Hidden } from './Hidden';
import { useIsSSR } from '../ssr/SSRProvider';

import { S, subSlot } from '../internal';

// octane adaptation: carries the owning Document (not a boolean) so placeholder
// refs can reach the store; a non-null value means "shallow render".
const ShallowRenderContext = createContext<Document<any, BaseCollection<any>> | null>(null);
const CollectionDocumentContext = createContext<Document<any, BaseCollection<any>> | null>(null);

export interface CollectionBuilderProps<C extends BaseCollection<any>> {
	content: any;
	children: (collection: C) => any;
	createCollection?: () => C;
}

/**
 * Builds a `Collection` from the children provided to the `content` prop, and passes it to the
 * child render prop function.
 */
export function CollectionBuilder<C extends BaseCollection<any>>(
	props: CollectionBuilderProps<C>,
): any {
	const slot = S('CollectionBuilder');
	// If a document was provided above us, we're already in a hidden tree. Just render the content.
	let doc = useContext(CollectionDocumentContext);
	if (doc) {
		return props.content;
	}

	// Otherwise, render a hidden copy of the children so that we can build the collection
	// before constructing the state. This should always come before the real DOM content so
	// we have built the collection by the time it renders during SSR.
	let { collection, document } = useCollectionDocument<any, C>(
		props.createCollection,
		subSlot(slot, 'doc'),
	);
	return createElement(
		Fragment,
		null,
		createElement(Hidden, {
			target: document.getRootElement(),
			children: createElement(CollectionDocumentContext.Provider, {
				value: document,
				children: props.content,
			}),
		}),
		createElement(CollectionInner, { render: props.children, collection }),
	);
}

function CollectionInner(props: { collection: any; render: (collection: any) => any }): any {
	return props.render(props.collection);
}

interface CollectionDocumentResult<T, C extends BaseCollection<T>> {
	collection: C;
	document: Document<T, C>;
}

function useCollectionDocument<T extends object, C extends BaseCollection<T>>(
	createCollection: (() => C) | undefined,
	slot: symbol | undefined,
): CollectionDocumentResult<T, C> {
	// The document instance is mutable, and should never change between renders.
	// useSyncExternalStore is used to subscribe to updates, which vends immutable
	// Collection objects.
	let [document] = useState(
		() => new Document<T, C>(createCollection?.() || (new BaseCollection() as C)),
		subSlot(slot, 'document'),
	);
	let subscribe = useCallback(
		(fn: () => void) => document.subscribe(fn),
		[document],
		subSlot(slot, 'subscribe'),
	);
	let getSnapshot = useCallback(
		() => {
			let collection = document.getCollection();
			if (document.isSSR) {
				// After SSR is complete, reset the document to empty so it is ready for the
				// client to render the portal into. We do this _after_ getting the collection
				// above so that the collection still has content in it from SSR during the
				// current render, before the client render has finished.
				document.resetAfterSSR();
			}
			return collection;
		},
		[document],
		subSlot(slot, 'getSnapshot'),
	);
	let getServerSnapshot = useCallback(
		() => {
			document.isSSR = true;
			return document.getCollection();
		},
		[document],
		subSlot(slot, 'getServerSnapshot'),
	);
	let collection = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
		subSlot(slot, 'collection'),
	);
	return { collection, document };
}

const SSRContext = createContext<Document<any, any> | ElementNode<any> | null>(null);

export type CollectionNodeClass<T> = {
	new (key: Key): CollectionNode<T>;
	readonly type: string;
};

function createCollectionNodeClass(type: string): CollectionNodeClass<any> {
	let NodeClass = class extends CollectionNode<any> {
		static readonly type = type;
	};
	return NodeClass;
}

function useSSRCollectionNode<T extends Element>(
	CollectionNodeClass: CollectionNodeClass<T> | string,
	props: object,
	ref: any,
	rendered: any,
	children: any,
	render: ((node: Node<any>) => any) | undefined,
	slot: symbol | undefined,
): any {
	// To prevent breaking change, if CollectionNodeClass is a string, create a
	// CollectionNodeClass using the string as the type
	if (typeof CollectionNodeClass === 'string') {
		CollectionNodeClass = createCollectionNodeClass(CollectionNodeClass);
	}
	const NodeClass = CollectionNodeClass as CollectionNodeClass<any>;

	let doc = useContext(ShallowRenderContext);
	// octane adaptation: the ref receives the REAL placeholder element; it
	// registers into the Document store read from context (upstream's fake
	// element carried `setProps` itself). Prop updates re-fire the ref (new
	// callback identity per render), which is the synchronous dirty signal;
	// structural-only changes are caught by the Document's MutationObserver.
	let itemRef = useCallback(
		(element: Element | null) => {
			if (element !== null) {
				doc!.setElementProps(element, props as any, ref, NodeClass, rendered, render);
			}
		},
		[doc, props, ref, rendered, render, NodeClass],
		subSlot(slot, 'itemRef'),
	);
	let parentNode = useContext(SSRContext);
	if (parentNode) {
		// During SSR, portals are not supported, so the collection children are wrapped
		// in an SSRContext. Since SSR occurs only once, we assume that the elements are
		// rendered in order and never re-render. Therefore we can create nodes in our
		// collection document during render so that they are in the collection by the
		// time we need it to render the real DOM. (Re-render guard kept from upstream.)
		let element = parentNode.ownerDocument.nodesByProps.get(props);
		if (!element) {
			element = parentNode.ownerDocument.createElement(NodeClass.type);
			element.setProps(props as any, ref, NodeClass, rendered, render);
			parentNode.appendChild(element);
			parentNode.ownerDocument.updateCollection();
			parentNode.ownerDocument.nodesByProps.set(props, element);
		}

		return children ? createElement(SSRContext.Provider, { value: element, children }) : null;
	}

	// The placeholder tag is the node type (`<item>`/`<section>`-style) — a valid
	// real HTMLUnknownElement in the detached container.
	return createElement(NodeClass.type, { ref: itemRef, children });
}

export function createLeafComponent<T, P extends object, E extends Element>(
	CollectionNodeClass: CollectionNodeClass<any> | string,
	render: (props: P, ref: any, node?: Node<T>) => any,
): (props: P & { ref?: any }) => any {
	let Component = ({ node }: { node: Node<any> }) => render(node.props, node.props.ref, node);
	let Result = (props: P & { ref?: any }) => {
		const slot = S('createLeafComponent');
		let ref = (props as any).ref;
		let focusableProps = useContext(FocusableContext);
		let doc = useContext(ShallowRenderContext);
		if (!doc) {
			if (render.length >= 3) {
				throw new Error(render.name + ' cannot be rendered outside a collection.');
			}
			return render(props, ref);
		}

		return useSSRCollectionNode(
			CollectionNodeClass,
			props,
			ref,
			'children' in props ? (props as any).children : null,
			null,
			(node) =>
				// Forward FocusableContext to real DOM tree so tooltips work.
				createElement(FocusableContext.Provider, {
					value: focusableProps,
					children: createElement(Component, { node }),
				}),
			subSlot(slot, 'node'),
		);
	};
	return Result;
}

export function createBranchComponent<T, P extends { children?: any }, E extends Element>(
	CollectionNodeClass: CollectionNodeClass<any> | string,
	render: (props: P, ref: any, node: Node<T>) => any,
	useChildren: (props: P, slot?: symbol) => any = useCollectionChildren,
): (props: P & { ref?: any }) => any {
	let Component = ({ node }: { node: Node<any> }) => render(node.props, node.props.ref, node);
	let Result = (props: P & { ref?: any }) => {
		const slot = S('createBranchComponent');
		let children = useChildren(props, subSlot(slot, 'children'));
		return (
			useSSRCollectionNode(
				CollectionNodeClass,
				props,
				(props as any).ref,
				null,
				children,
				(node) => createElement(Component, { node }),
				subSlot(slot, 'node'),
			) ?? null
		);
	};
	return Result;
}

function useCollectionChildren<T>(options: CachedChildrenOptions<T>, slot?: symbol): any {
	return useCachedChildren({ ...options, addIdAndValue: true }, slot);
}

export interface CollectionProps<T> extends CachedChildrenOptions<T> {}

const CollectionContext = createContext<CachedChildrenOptions<unknown> | null>(null);

/** A Collection renders a list of items, automatically managing caching and keys. */
export function Collection<T>(props: CollectionProps<T>): any {
	const slot = S('Collection');
	let ctx = useContext(CollectionContext)!;
	let dependencies = (ctx?.dependencies || []).concat(props.dependencies);
	let idScope = props.idScope ?? ctx?.idScope;
	let children = useCollectionChildren(
		{
			...props,
			idScope,
			dependencies,
		},
		subSlot(slot, 'children'),
	);

	let doc = useContext(CollectionDocumentContext);
	if (doc) {
		children = createElement(CollectionRoot, { children });
	}

	// Propagate dependencies and idScope to child collections.
	ctx = useMemo(
		() => ({
			dependencies,
			idScope,
		}),
		[idScope, ...dependencies],
		subSlot(slot, 'ctx'),
	);

	return createElement(CollectionContext.Provider, { value: ctx, children });
}

function CollectionRoot(props: { children: any }): any {
	const slot = S('CollectionRoot');
	let doc = useContext(CollectionDocumentContext);
	let wrappedChildren = useMemo(
		() =>
			createElement(CollectionDocumentContext.Provider, {
				value: null,
				children: createElement(ShallowRenderContext.Provider, {
					value: doc,
					children: props.children,
				}),
			}),
		[props.children, doc],
		subSlot(slot, 'wrapped'),
	);
	// During SSR, we render the content directly, and append nodes to the document
	// during render. The collection children return null so that nothing is actually
	// rendered into the HTML.
	// octane adaptation: on the client there is NO second portal — this subtree
	// already renders inside `Hidden`'s portal into the Document's detached
	// container, so the placeholders land in the walked tree directly.
	let isSSR = useIsSSR(subSlot(slot, 'ssr'));
	return isSSR
		? createElement(SSRContext.Provider, { value: doc, children: wrappedChildren })
		: wrappedChildren;
}
