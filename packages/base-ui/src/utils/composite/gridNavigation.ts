// Ported from .base-ui/packages/react/src/internals/composite/root/gridNavigation.ts (v1.6.0).
// The navigator a composite passes to `useCompositeRoot`'s `grid` option — distinct from
// `../floating/gridNavigation`, which is the 1x1 navigator `useListNavigation` injects for itself.
//
// octane adaptations: the event is the NATIVE `KeyboardEvent`, and `React.RefObject<T>` is a plain
// `{ current: T }`. Not a hook, so no slot.
import {
	createGridCellMap,
	getGridCellIndexOfCorner,
	getGridCellIndices,
	getGridNavigatedIndex,
} from './grid-utils';
import { isListIndexDisabled } from './list-utils';
import { ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT } from './keys';

type CompositeGridElementsRef = { current: Array<HTMLElement | null> };
type CompositeGridOnLoop = (event: KeyboardEvent, prevIndex: number, nextIndex: number) => number;

export interface CompositeGridItemSize {
	width: number;
	height: number;
}

export interface CompositeGridConfig {
	cols: number;
	dense?: boolean | undefined;
	itemSizes?: CompositeGridItemSize[] | undefined;
}

export interface CompositeGridNavigationState {
	event: KeyboardEvent;
	elementsRef: CompositeGridElementsRef;
	highlightedIndex: number;
	minIndex: number;
	maxIndex: number;
	orientation: 'horizontal' | 'vertical' | 'both';
	loopFocus: boolean;
	onLoop?: CompositeGridOnLoop | undefined;
	disabledIndices?: number[] | undefined;
	rtl: boolean;
}

export type CompositeGridNavigator = (state: CompositeGridNavigationState) => number;

/**
 * Builds the grid navigation handler passed to `CompositeRoot`/`useCompositeRoot`
 * via the `grid` prop. Importing and calling this is the opt-in for grid
 * navigation: composites that don't pass `grid` never reference the algorithm,
 * so bundlers tree-shake the grid helpers out.
 */
export function gridNavigation(config: CompositeGridConfig): CompositeGridNavigator {
	const { cols, dense = false, itemSizes } = config;

	return (state) => {
		const {
			disabledIndices,
			elementsRef,
			event,
			highlightedIndex,
			loopFocus,
			maxIndex,
			minIndex,
			onLoop,
			orientation,
			rtl,
		} = state;

		const sizes =
			itemSizes ||
			Array.from({ length: elementsRef.current.length }, () => ({
				width: 1,
				height: 1,
			}));
		// Work in hypothetical 1x1 cell indices, then convert back to item indices.
		const cellMap = createGridCellMap(sizes, cols, dense);
		const minGridIndex = cellMap.findIndex(
			(index) => index != null && !isListIndexDisabled(elementsRef.current, index, disabledIndices),
		);
		const maxGridIndex = cellMap.reduce(
			(foundIndex: number, index, cellIndex) =>
				index != null && !isListIndexDisabled(elementsRef.current, index, disabledIndices)
					? cellIndex
					: foundIndex,
			-1,
		);
		const cellIndex = getGridNavigatedIndex(
			cellMap.map((itemIndex) => (itemIndex != null ? elementsRef.current[itemIndex] : null)),
			{
				event,
				orientation,
				loopFocus,
				onLoop,
				cols,
				// Treat undefined gaps as disabled so navigation cannot land in them.
				disabledIndices: getGridCellIndices(
					[
						...(disabledIndices ||
							elementsRef.current.map((_, index) =>
								isListIndexDisabled(elementsRef.current, index) ? index : undefined,
							)),
						undefined,
					],
					cellMap,
				),
				minIndex: minGridIndex,
				maxIndex: maxGridIndex,
				prevIndex: getGridCellIndexOfCorner(
					highlightedIndex > maxIndex ? minIndex : highlightedIndex,
					sizes,
					cellMap,
					cols,
					// Choose the corner closest to the movement direction so spanning items
					// do not immediately resolve back to themselves.
					event.key === ARROW_DOWN
						? 'bl'
						: event.key === (rtl ? ARROW_LEFT : ARROW_RIGHT)
							? 'tr'
							: 'tl',
				),
				rtl,
			},
		);

		// Navigated cell will never be nullish.
		return cellMap[cellIndex] as number;
	};
}
