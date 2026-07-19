// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Collection.tsx).
// octane adaptations: the collection engine lives at `../collections/*` (the
// detached-real-DOM host — see src/collections/Document.ts); `.tsx` → `.ts`
// (JSX → createElement), no forwardRef (octane refs are props), React element
// types → `any`, S()/subSlot slot conventions. The public `Collection`
// component + its `CollectionProps` live in the engine (upstream: exported
// from `react-aria/Collection`); they are re-exported here for the package
// index, matching the upstream RAC index wiring. Note upstream's RAC-local
// `CollectionProps` interface (a different type, used internally by collection
// components) is NOT exported from the RAC index — it stays module-local here
// as `ItemCollectionProps` consumers import from this module directly.
import type {
	Collection as ICollection,
	CollectionBase,
	DropTargetDelegate,
	GlobalDOMAttributes,
	ItemDropTarget,
	Key,
	LayoutDelegate,
	Node,
	RefObject,
	SelectionBehavior,
	SelectionMode,
	SectionProps as SharedSectionProps,
} from '@react-types/shared';
import {
	Fragment,
	cloneElement,
	createContext,
	createElement,
	isValidElement,
	useContext,
	useMemo,
} from 'octane';
import { createBranchComponent } from '../collections/CollectionBuilder';
import { useCachedChildren } from '../collections/useCachedChildren';

import type { StyleProps } from './utils';

import { S, splitSlot, subSlot } from '../internal';

// Re-export the engine's public Collection component + props, as the upstream
// RAC index does (`export {Collection} from 'react-aria/Collection'`).
export { Collection } from '../collections/CollectionBuilder';
export type { CollectionProps } from '../collections/CollectionBuilder';

/**
 * The RAC-local collection props shape (upstream `CollectionProps` in
 * react-aria-components/src/Collection.tsx — renamed to avoid clashing with
 * the engine's exported `CollectionProps`).
 */
export interface ItemCollectionProps<T> extends Omit<CollectionBase<T>, 'children'> {
	/** The contents of the collection. */
	children?: any | ((item: T) => any);
	/** Values that should invalidate the item cache when using dynamic collections. */
	dependencies?: ReadonlyArray<any>;
}

export interface ItemRenderProps {
	/**
	 * Whether the item is currently hovered with a mouse.
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether the item is currently in a pressed state.
	 * @selector [data-pressed]
	 */
	isPressed: boolean;
	/**
	 * Whether the item is currently selected.
	 * @selector [data-selected]
	 */
	isSelected: boolean;
	/**
	 * Whether the item is currently focused.
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the item is currently keyboard focused.
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the item is non-interactive, i.e. both selection and actions are disabled and the item
	 * may not be focused. Dependent on `disabledKeys` and `disabledBehavior`.
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * The type of selection that is allowed in the collection.
	 * @selector [data-selection-mode="single | multiple"]
	 */
	selectionMode: SelectionMode;
	/** The selection behavior for the collection. */
	selectionBehavior: SelectionBehavior;
	/**
	 * Whether the item allows dragging.
	 * @note This property is only available in collection components that support drag and drop.
	 * @selector [data-allows-dragging]
	 */
	allowsDragging?: boolean;
	/**
	 * Whether the item is currently being dragged.
	 * @note This property is only available in collection components that support drag and drop.
	 * @selector [data-dragging]
	 */
	isDragging?: boolean;
	/**
	 * Whether the item is currently an active drop target.
	 * @note This property is only available in collection components that support drag and drop.
	 * @selector [data-drop-target]
	 */
	isDropTarget?: boolean;
}

export interface SectionProps<T>
	extends
		Omit<SharedSectionProps<T>, 'children' | 'title'>,
		StyleProps,
		GlobalDOMAttributes<HTMLElement> {
	/** The unique id of the section. */
	id?: Key;
	/**
	 * The object value that this section represents. When using dynamic collections, this is set
	 * automatically.
	 */
	value?: T;
	/** Static child items or a function to render children. */
	children?: any | ((item: T) => any);
	/** Values that should invalidate the item cache when using dynamic collections. */
	dependencies?: ReadonlyArray<any>;
}

interface SectionContextValue {
	name: string;
	render: (props: SectionProps<any>, ref: any, section: Node<any>, className?: string) => any;
}

export const SectionContext = createContext<SectionContextValue | null>(null);

/** @deprecated */
export const Section = /*#__PURE__*/ createBranchComponent(
	'section',
	<T>(props: SectionProps<T>, ref: any, section: Node<T>): any => {
		let { name, render } = useContext(SectionContext)!;
		if (process.env.NODE_ENV !== 'production') {
			console.warn(`<Section> is deprecated. Please use <${name}> instead.`);
		}
		return render(props, ref, section, 'react-aria-Section');
	},
);

export interface CollectionBranchProps {
	/** The collection of items to render. */
	collection: ICollection<Node<unknown>>;
	/** The parent node of the items to render. */
	parent: Node<unknown>;
	/** A function that renders a drop indicator between items. */
	renderDropIndicator?: (target: ItemDropTarget) => any;
}

export interface CollectionRootProps {
	/** The collection of items to render. */
	collection: ICollection<Node<unknown>>;
	/** A set of keys for items that should always be persisted in the DOM. */
	persistedKeys?: Set<Key> | null;
	/** A ref to the scroll container for the collection. */
	scrollRef?: RefObject<HTMLElement | null>;
	/** A function that renders a drop indicator between items. */
	renderDropIndicator?: (target: ItemDropTarget) => any;
	[key: string]: any;
}

export interface CollectionRenderer {
	/** Whether this is a virtualized collection. */
	isVirtualized?: boolean;
	/** A delegate object that provides layout information for items in the collection. */
	layoutDelegate?: LayoutDelegate;
	/** A delegate object that provides drop targets for pointer coordinates within the collection. */
	dropTargetDelegate?: DropTargetDelegate;
	/** A component that renders the root collection items. */
	CollectionRoot: (props: CollectionRootProps) => any;
	/** A component that renders the child collection items. */
	CollectionBranch: (props: CollectionBranchProps) => any;
}

export const DefaultCollectionRenderer: CollectionRenderer = {
	CollectionRoot({ collection, renderDropIndicator }) {
		const slot = S('DefaultCollectionRoot');
		return useCollectionRender(collection, null, renderDropIndicator, subSlot(slot, 'render'));
	},
	CollectionBranch({ collection, parent, renderDropIndicator }) {
		const slot = S('DefaultCollectionBranch');
		return useCollectionRender(collection, parent, renderDropIndicator, subSlot(slot, 'render'));
	},
};

function useCollectionRender(
	collection: ICollection<Node<unknown>>,
	parent: Node<unknown> | null,
	renderDropIndicator: ((target: ItemDropTarget) => any) | undefined,
	slot: symbol | undefined,
): any {
	return useCachedChildren(
		{
			items: parent ? collection.getChildren!(parent.key) : collection,
			dependencies: [renderDropIndicator],
			children(node: Node<unknown>) {
				// Return an empty fragment since we don't want to render the content twice.
				// If we don't skip the content node here, we end up rendering it twice in a
				// Tree since we also render the content node in TreeItem.
				if (node.type === 'content') {
					return createElement(Fragment, null);
				}

				let rendered = node.render!(node);
				if (!renderDropIndicator || node.type !== 'item') {
					return rendered;
				}

				return createElement(
					Fragment,
					null,
					renderDropIndicator({ type: 'item', key: node.key, dropPosition: 'before' }),
					rendered,
					renderAfterDropIndicators(collection, node, renderDropIndicator),
				);
			},
		},
		slot,
	);
}

export function renderAfterDropIndicators(
	collection: ICollection<Node<unknown>>,
	node: Node<unknown>,
	renderDropIndicator: (target: ItemDropTarget) => any,
): any {
	let key = node.key;
	let keyAfter = collection.getKeyAfter(key);
	let nextItemInFlattenedCollection = keyAfter != null ? collection.getItem(keyAfter) : null;
	while (nextItemInFlattenedCollection != null && nextItemInFlattenedCollection.type !== 'item') {
		keyAfter = collection.getKeyAfter(nextItemInFlattenedCollection.key);
		nextItemInFlattenedCollection = keyAfter != null ? collection.getItem(keyAfter) : null;
	}

	let nextItemInSameLevel = node.nextKey != null ? collection.getItem(node.nextKey) : null;
	while (nextItemInSameLevel != null && nextItemInSameLevel.type !== 'item') {
		nextItemInSameLevel =
			nextItemInSameLevel.nextKey != null ? collection.getItem(nextItemInSameLevel.nextKey) : null;
	}

	// Render one or more "after" drop indicators when the next item in the flattened collection
	// has a smaller level, is not an item, or there are no more items in the collection.
	// Otherwise, the "after" position is equivalent to the next item's "before" position.
	let afterIndicators: any[] = [];
	if (nextItemInSameLevel == null) {
		let current: Node<unknown> | null = node;
		while (
			current?.type === 'item' &&
			(!nextItemInFlattenedCollection ||
				(current.parentKey !== nextItemInFlattenedCollection.parentKey &&
					nextItemInFlattenedCollection.level < current.level))
		) {
			let indicator = renderDropIndicator({
				type: 'item',
				key: current.key,
				dropPosition: 'after',
			});
			if (isValidElement(indicator)) {
				afterIndicators.push(cloneElement(indicator, { key: `${current.key}-after` }));
			}
			current = current.parentKey != null ? collection.getItem(current.parentKey) : null;
		}
	}

	return afterIndicators;
}

export const CollectionRendererContext =
	createContext<CollectionRenderer>(DefaultCollectionRenderer);

type PersistedKeysReturnValue = Set<Key> | null;
export function usePersistedKeys(focusedKey: Key | null): PersistedKeysReturnValue;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function usePersistedKeys(
	focusedKey: Key | null,
	slot: symbol | undefined,
): PersistedKeysReturnValue;
export function usePersistedKeys(...args: any[]): PersistedKeysReturnValue {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('usePersistedKeys');
	const focusedKey = user[0] as Key | null;
	return useMemo(
		() => (focusedKey != null ? new Set([focusedKey]) : null),
		[focusedKey],
		subSlot(slot, 'keys'),
	);
}
