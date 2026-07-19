// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/useDragAndDrop.tsx).
// PHASE-7: the react-aria drag-and-drop ENGINE (useDraggableCollection(State),
// useDroppableCollection(State), useDropIndicator, DragManager, ListDropTargetDelegate)
// is NOT ported yet. This module ships the `DragAndDropHooks` / `DragAndDropOptions`
// TYPE surface so collection components can accept a `dragAndDropHooks` prop (their dnd
// branches stay inert until a consumer can construct hooks), with every engine-referencing
// member typed via local structural aliases below. The `useDragAndDrop()` function itself
// is a THROWING STUB (the remix-router framework-stub precedent): importing is safe;
// CALLING throws with a pointer to the phase plan instead of failing somewhere deep inside.
// octane adaptations: `.tsx` → `.ts`; `JSX.Element` → a structural `any` alias.
import type {
	DragItem,
	DraggableCollectionProps,
	DropTarget,
	DropTargetDelegate,
	DroppableCollectionProps,
	Key,
	RefObject,
} from '@react-types/shared';

export { DropIndicator, DropIndicatorContext, DragAndDropContext } from './DragAndDrop';
export type { DropIndicatorProps, DropIndicatorRenderProps } from './DragAndDrop';

// octane adaptation: structural alias for React's JSX.Element.
type JSXElement = any;

// ── PHASE-7 structural aliases ──────────────────────────────────────────────
// Stand-ins for the unported react-aria/react-stately dnd engine types. They keep
// `DragAndDropHooks` importable as a TYPE without pulling any engine code; Phase 7
// replaces them with the real ported definitions.
/** PHASE-7: react-stately/useDraggableCollectionState's DraggableCollectionState (engine unported). */
export type DraggableCollectionState = any;
/** PHASE-7: react-stately/useDraggableCollectionState's DraggableCollectionStateOptions (engine unported). */
export type DraggableCollectionStateOptions = any;
/** PHASE-7: react-aria/useDraggableCollection's DraggableCollectionOptions (engine unported). */
export type DraggableCollectionOptions = any;
/** PHASE-7: react-aria/useDraggableCollection's DraggableItemProps (engine unported). */
export type DraggableItemProps = any;
/** PHASE-7: react-aria/useDraggableCollection's DraggableItemResult (engine unported). */
export type DraggableItemResult = any;
/** PHASE-7: react-aria/useDraggableCollection's DragPreview component type (engine unported). */
export type DragPreview = any;
/** PHASE-7: react-stately/useDroppableCollectionState's DroppableCollectionState (engine unported). */
export type DroppableCollectionState = any;
/** PHASE-7: react-stately/useDroppableCollectionState's DroppableCollectionStateOptions (engine unported). */
export type DroppableCollectionStateOptions = any;
/** PHASE-7: react-aria/useDroppableCollection's DroppableCollectionOptions (engine unported). */
export type DroppableCollectionOptions = any;
/** PHASE-7: react-aria/useDroppableCollection's DroppableCollectionResult (engine unported). */
export type DroppableCollectionResult = any;
/** PHASE-7: react-aria/useDroppableCollection's DroppableItemOptions (engine unported). */
export type DroppableItemOptions = any;
/** PHASE-7: react-aria/useDroppableCollection's DroppableItemResult (engine unported). */
export type DroppableItemResult = any;
/** PHASE-7: react-aria/useDropIndicator's DropIndicatorProps (engine unported; `target` is real). */
export interface AriaDropIndicatorProps {
	/** The drop target that the drop indicator represents. */
	target: DropTarget;
	/** PHASE-7: the activate-button ref (engine unported). */
	activateButtonRef?: RefObject<any>;
}
/** PHASE-7: react-aria/useDropIndicator's DropIndicatorAria (engine unported). */
export type DropIndicatorAria = any;
/** PHASE-7: react-aria/ListDropTargetDelegate's class type (engine unported). */
export type ListDropTargetDelegate = any;

interface DraggableCollectionStateOpts<T = object> extends Omit<
	DraggableCollectionStateOptions,
	'getItems'
> {}

interface DragHooks<T = object> {
	useDraggableCollectionState?: (
		props: DraggableCollectionStateOpts<T>,
	) => DraggableCollectionState;
	useDraggableCollection?: (
		props: DraggableCollectionOptions,
		state: DraggableCollectionState,
		ref: RefObject<HTMLElement | null>,
	) => void;
	useDraggableItem?: (
		props: DraggableItemProps,
		state: DraggableCollectionState,
	) => DraggableItemResult;
	DragPreview?: DragPreview;
	renderDragPreview?: (
		items: DragItem[],
	) => JSXElement | { element: JSXElement; x: number; y: number };
	isVirtualDragging?: () => boolean;
}

interface DropHooks {
	useDroppableCollectionState?: (
		props: DroppableCollectionStateOptions,
	) => DroppableCollectionState;
	useDroppableCollection?: (
		props: DroppableCollectionOptions,
		state: DroppableCollectionState,
		ref: RefObject<HTMLElement | null>,
	) => DroppableCollectionResult;
	useDroppableItem?: (
		options: DroppableItemOptions,
		state: DroppableCollectionState,
		ref: RefObject<HTMLElement | null>,
	) => DroppableItemResult;
	useDropIndicator?: (
		props: AriaDropIndicatorProps,
		state: DroppableCollectionState,
		ref: RefObject<HTMLElement | null>,
	) => DropIndicatorAria;
	renderDropIndicator?: (target: DropTarget) => JSXElement;
	dropTargetDelegate?: DropTargetDelegate;
	ListDropTargetDelegate: ListDropTargetDelegate;
}

export type DragAndDropHooks<T = object> = DragHooks<T> & DropHooks;

export interface DragAndDrop<T = object> {
	/** Drag and drop hooks for the collection element. */
	dragAndDropHooks: DragAndDropHooks<T>;
}

export interface DragAndDropOptions<T = object>
	extends Omit<DraggableCollectionProps, 'preview' | 'getItems'>, DroppableCollectionProps {
	/**
	 * A function that returns the items being dragged. If not specified, we assume that the
	 * collection is not draggable.
	 *
	 * @default () => []
	 */
	getItems?: (keys: Set<Key>, items: T[]) => DragItem[];
	/**
	 * A function that renders a drag preview, which is shown under the user's cursor while dragging.
	 * By default, a copy of the dragged element is rendered.
	 */
	renderDragPreview?: (
		items: DragItem[],
	) => JSXElement | { element: JSXElement; x: number; y: number };
	/**
	 * A function that renders a drop indicator element between two items in a collection.
	 * This should render a `<DropIndicator>` element. If this function is not provided, a
	 * default DropIndicator is provided.
	 */
	renderDropIndicator?: (target: DropTarget) => JSXElement;
	/**
	 * A custom delegate object that provides drop targets for pointer coordinates within the
	 * collection.
	 */
	dropTargetDelegate?: DropTargetDelegate;
	/** Whether the drag and drop events should be disabled. */
	isDisabled?: boolean;
}

/**
 * Provides the hooks required to enable drag and drop behavior for a drag and drop compatible
 * collection component.
 *
 * PHASE-7: throwing stub — the dnd engine is not ported yet.
 */
export function useDragAndDrop<T = object>(options: DragAndDropOptions<T>): DragAndDrop<T> {
	throw new Error(
		'@octanejs/aria: useDragAndDrop is not ported yet (drag and drop arrives in a later phase)',
	);
}
