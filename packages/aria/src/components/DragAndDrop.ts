// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/DragAndDrop.tsx).
// PHASE-7: the dnd ENGINE stays unported — the engine-referencing types
// (DraggableCollectionState, DroppableCollectionState, AriaDropIndicatorProps) come from
// the structural aliases in './useDragAndDrop'. This module ports the CONTEXT layer the
// collection components compose: the contexts, DropIndicator, useDndPersistedKeys, and
// useRenderDropIndicator (all inert until a consumer passes `dragAndDropHooks`, which
// nothing can construct before Phase 7).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — DropIndicator
// receives the forwarded ref as `props.ref` and passes it to the context render function;
// public hooks get the binding's slot threading (splitSlot/subSlot); `ReactNode`/
// `ForwardedRef` → structural aliases; explicit dep arrays preserved verbatim (including
// upstream's eslint-annotated `[dropState?.target, ...]` invalidation array).
import type { ItemDropTarget, Key } from '@react-types/shared';
import { createElement, useCallback, useContext, useMemo, createContext } from 'octane';

import type { ClassNameOrFunction, RenderProps } from './utils';
import type {
	AriaDropIndicatorProps,
	DragAndDropHooks,
	DraggableCollectionState,
	DroppableCollectionState,
} from './useDragAndDrop';
import type { MultipleSelectionManager } from '../stately/selection/types';
import { S, splitSlot, subSlot } from '../internal';

// octane adaptations: structural aliases for the React types upstream drags along.
type ReactNode = any;
type ForwardedRef<T> = any;

export interface DragAndDropContextValue {
	dragAndDropHooks?: DragAndDropHooks;
	dragState?: DraggableCollectionState;
	dropState?: DroppableCollectionState;
}

export const DragAndDropContext = createContext<DragAndDropContextValue>({});
export const DropIndicatorContext = createContext<DropIndicatorContextValue | null>(null);

export interface DropIndicatorRenderProps {
	/**
	 * Whether the drop indicator is currently the active drop target.
	 *
	 * @selector [data-drop-target]
	 */
	isDropTarget: boolean;
}

export interface DropIndicatorProps
	extends Omit<AriaDropIndicatorProps, 'activateButtonRef'>, RenderProps<DropIndicatorRenderProps> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-DropIndicator'
	 */
	className?: ClassNameOrFunction<DropIndicatorRenderProps>;
}
interface DropIndicatorContextValue {
	render: (props: DropIndicatorProps, ref: ForwardedRef<HTMLElement>) => ReactNode;
}

/**
 * A DropIndicator is rendered between items in a collection to indicate where dropped data will be
 * inserted.
 */
// octane adaptation: no forwardRef — the forwarded ref arrives as `props.ref` and is split
// off before handing the remaining props to the context render function, preserving
// upstream's `render(props, ref)` contract.
export function DropIndicator(
	props: DropIndicatorProps & { ref?: ForwardedRef<HTMLElement> },
): any {
	let { render } = useContext(DropIndicatorContext)!;
	let { ref, ...otherProps } = props as any;
	return render(otherProps, ref);
}

type RenderDropIndicatorRetValue = ((target: ItemDropTarget) => ReactNode | undefined) | undefined;

export function useRenderDropIndicator(
	dragAndDropHooks?: DragAndDropHooks,
	dropState?: DroppableCollectionState,
): RenderDropIndicatorRetValue;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useRenderDropIndicator(
	dragAndDropHooks: DragAndDropHooks | undefined,
	dropState: DroppableCollectionState | undefined,
	slot: symbol | undefined,
): RenderDropIndicatorRetValue;
export function useRenderDropIndicator(...args: any[]): RenderDropIndicatorRetValue {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useRenderDropIndicator');
	const dragAndDropHooks = user[0] as DragAndDropHooks | undefined;
	const dropState = user[1] as DroppableCollectionState | undefined;

	let renderDropIndicator = dragAndDropHooks?.renderDropIndicator;
	let isVirtualDragging = dragAndDropHooks?.isVirtualDragging?.();
	let fn = useCallback(
		(target: ItemDropTarget) => {
			// Only show drop indicators when virtual dragging or this is the current drop target.
			if (isVirtualDragging || dropState?.isDropTarget(target)) {
				return renderDropIndicator
					? renderDropIndicator(target)
					: createElement(DropIndicator, { target });
			}
		},
		// We invalidate whenever the target changes.
		[dropState?.target, isVirtualDragging, renderDropIndicator],
		subSlot(slot, 'fn'),
	);
	return dragAndDropHooks?.useDropIndicator ? fn : undefined;
}

export function useDndPersistedKeys(
	selectionManager: MultipleSelectionManager,
	dragAndDropHooks?: DragAndDropHooks,
	dropState?: DroppableCollectionState,
): Set<Key>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useDndPersistedKeys(
	selectionManager: MultipleSelectionManager,
	dragAndDropHooks: DragAndDropHooks | undefined,
	dropState: DroppableCollectionState | undefined,
	slot: symbol | undefined,
): Set<Key>;
export function useDndPersistedKeys(...args: any[]): Set<Key> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useDndPersistedKeys');
	const selectionManager = user[0] as MultipleSelectionManager;
	const dragAndDropHooks = user[1] as DragAndDropHooks | undefined;
	const dropState = user[2] as DroppableCollectionState | undefined;

	// Persist the focused key and the drop target key.
	let focusedKey = selectionManager.focusedKey;
	let dropTargetKey: Key | null | undefined = null;
	if (dragAndDropHooks?.isVirtualDragging?.() && dropState?.target?.type === 'item') {
		dropTargetKey = dropState.target.key;
		if (dropState.target.dropPosition === 'after') {
			// Normalize to the "before" drop position since we only render those to the DOM.
			let nextKey = dropState.collection.getKeyAfter(dropTargetKey);
			let lastDescendantKey: Key | null = null;
			if (nextKey != null) {
				let targetLevel = dropState.collection.getItem(dropTargetKey)?.level ?? 0;
				// Skip over any rows that are descendants of the target ("after" position should be after all children)
				while (nextKey != null) {
					let node = dropState.collection.getItem(nextKey);
					if (!node) {
						break;
					}
					// Skip over non-item nodes (e.g., loaders) since they can't be drop targets.
					if (node.type !== 'item') {
						nextKey = dropState.collection.getKeyAfter(nextKey);
						continue;
					}

					// Stop once we find an item at the same level or higher
					if ((node.level ?? 0) <= targetLevel) {
						break;
					}

					lastDescendantKey = nextKey;
					nextKey = dropState.collection.getKeyAfter(nextKey);
				}
			}

			// If nextKey is null (end of collection), use the last descendant
			dropTargetKey = nextKey ?? lastDescendantKey ?? dropTargetKey;
		}
	}

	return useMemo(
		() => {
			return new Set([focusedKey, dropTargetKey].filter((k) => k != null));
		},
		[focusedKey, dropTargetKey],
		subSlot(slot, 'keys'),
	);
}
