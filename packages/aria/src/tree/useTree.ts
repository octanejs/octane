// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/tree/useTree.ts).
// octane adaptations:
// - `TreeState` comes from the ported stately tree hook; `DOMAttributes` is a local
//   structural prop-bag alias (upstream's is typed over React's synthetic handlers).
// - Public-hook slot threading (splitSlot/subSlot).
import type { KeyboardDelegate, RefObject } from '@react-types/shared';
import {
	type AriaGridListOptions,
	type AriaGridListProps,
	type GridListProps,
	useGridList,
} from '../gridlist/useGridList';
import type { TreeState } from '../stately/tree/useTreeState';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface TreeProps<T> extends GridListProps<T> {}

export interface AriaTreeProps<T> extends AriaGridListProps<T> {}
export interface AriaTreeOptions<T> extends Omit<
	AriaGridListOptions<T>,
	'children' | 'shouldFocusWrap'
> {
	/**
	 * An optional keyboard delegate implementation for type to select,
	 * to override the default.
	 */
	keyboardDelegate?: KeyboardDelegate;
}

export interface TreeAria {
	/** Props for the treegrid element. */
	gridProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a single column treegrid component
 * with interactive children. A tree grid provides users with a way to navigate nested hierarchical
 * information.
 *
 * @param props - Props for the treegrid.
 * @param state - State for the treegrid, as returned by `useTreeState`.
 * @param ref - The ref attached to the treegrid element.
 */
export function useTree<T>(
	props: AriaTreeOptions<T>,
	state: TreeState<T>,
	ref: RefObject<HTMLElement | null>,
): TreeAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTree<T>(
	props: AriaTreeOptions<T>,
	state: TreeState<T>,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): TreeAria;
export function useTree(...args: any[]): TreeAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTree');
	const props = user[0] as AriaTreeOptions<any>;
	const state = user[1] as TreeState<any>;
	const ref = user[2] as RefObject<HTMLElement | null>;

	// TreeState is a structural superset of ListState (collection/disabledKeys/selectionManager),
	// exactly like upstream's call into useGridList.
	let { gridProps } = useGridList(props as any, state as any, ref, subSlot(slot, 'gridList'));
	gridProps.role = 'treegrid';

	return {
		gridProps,
	};
}
