// Ported from @floating-ui/react Composite + CompositeItem — a single tab-stop whose
// items are arrow-key navigated (list nav outside a floating context). `.ts`
// components via createElement; React forwardRef → props.ref. `renderJsx` supports the
// `render` prop (a function, an element to clone, or a default <div>); octane has no
// cloneElement, so it's implemented locally over createElement.
import { createContext, createElement, useContext, useMemo, useRef, useState } from 'octane';
import type { OctaneNode } from 'octane';
import type { OctaneElement } from 'octane/jsx-runtime';
import type { Dimensions } from '@floating-ui/dom';

import { FloatingList, useListItem } from './FloatingList';
import { S } from './internal';
import { useMergeRefs } from './useMergeRefs';
import {
	createGridCellMap,
	findNonDisabledListIndex,
	getGridCellIndexOfCorner,
	getGridCellIndices,
	getGridNavigatedIndex,
	getMaxListIndex,
	getMinListIndex,
	isIndexOutOfListBounds,
	isListIndexDisabled,
	useEffectEvent,
	type DisabledIndices,
} from './utils';
import type { HTMLProps, MutableRefObject, RefCallback } from './types';

const ARROW_LEFT = 'ArrowLeft';
const ARROW_RIGHT = 'ArrowRight';
const ARROW_UP = 'ArrowUp';
const ARROW_DOWN = 'ArrowDown';
const horizontalKeys = [ARROW_LEFT, ARROW_RIGHT];
const verticalKeys = [ARROW_UP, ARROW_DOWN];
const allKeys = [...horizontalKeys, ...verticalKeys];

// Upstream's (unexported) `RenderProp`, in octane terms: an element descriptor
// to clone, or a factory receiving the computed HTML props.
type RenderProp = OctaneElement | ((props: HTMLProps<HTMLElement>) => OctaneNode);

type CompositeRef = MutableRefObject<HTMLElement | null> | RefCallback<HTMLElement> | null;

function cloneElement(el: OctaneElement, props: Record<string, unknown>): OctaneNode {
	return createElement(el.type, { ...el.props, ...props });
}

function renderJsx(
	render: RenderProp | undefined,
	computedProps: Record<string, unknown>,
): OctaneNode {
	if (typeof render === 'function') {
		return render(computedProps as HTMLProps<HTMLElement>);
	}
	if (render) {
		return cloneElement(render, computedProps);
	}
	return createElement('div', { ...computedProps });
}

interface CompositeContextValue {
	activeIndex: number;
	onNavigate(index: number): void;
}

export const CompositeContext = createContext<CompositeContextValue>({
	activeIndex: 0,
	onNavigate: () => {},
});

export interface CompositeProps {
	/**
	 * Determines the element to render.
	 * @example
	 * ```jsx
	 * <Composite render={<ul />} />
	 * <Composite render={(htmlProps) => <ul {...htmlProps} />} />
	 * ```
	 */
	render?: RenderProp;
	/**
	 * Determines the orientation of the composite.
	 */
	orientation?: 'horizontal' | 'vertical' | 'both';
	/**
	 * Determines whether focus should loop around when navigating past the first
	 * or last item.
	 */
	loop?: boolean;
	/**
	 * Whether the direction of the composite’s navigation is in RTL layout.
	 */
	rtl?: boolean;
	/**
	 * Determines the number of columns there are in the composite
	 * (i.e. it’s a grid).
	 */
	cols?: number;
	/**
	 * Determines which items are disabled. The `disabled` or `aria-disabled`
	 * attributes are used by default.
	 */
	disabledIndices?: DisabledIndices;
	/**
	 * Determines which item is active. Used to externally control the active
	 * item.
	 */
	activeIndex?: number;
	/**
	 * Called when the user navigates to a new item. Used to externally control
	 * the active item.
	 */
	onNavigate?(index: number): void;
	/**
	 * Only for `cols > 1`, specify sizes for grid items.
	 * `{ width: 2, height: 2 }` means an item is 2 columns wide and 2 rows tall.
	 */
	itemSizes?: Dimensions[];
	/**
	 * Only relevant for `cols > 1` and items with different sizes, specify if
	 * the grid is dense (as defined in the CSS spec for grid-auto-flow).
	 */
	dense?: boolean;
}

/**
 * Creates a single tab stop whose items are navigated by arrow keys, which
 * provides list navigation outside of floating element contexts.
 * @see https://floating-ui.com/docs/Composite
 */
export function Composite(
	props: CompositeProps & HTMLProps<HTMLElement> & { ref?: CompositeRef },
): OctaneNode {
	const render = props.render;
	const orientation = props.orientation ?? 'both';
	const loop = props.loop ?? true;
	const rtl = props.rtl ?? false;
	const cols = props.cols ?? 1;
	const disabledIndices = props.disabledIndices;
	const externalActiveIndex = props.activeIndex;
	const externalSetActiveIndex = props.onNavigate;
	const itemSizes = props.itemSizes;
	const dense = props.dense ?? false;
	const forwardedRef = props.ref;
	const {
		render: _r,
		orientation: _o,
		loop: _l,
		rtl: _rtl,
		cols: _c,
		disabledIndices: _di,
		activeIndex: _ai,
		onNavigate: _on,
		itemSizes: _is,
		dense: _d,
		ref: _ref,
		...domProps
	} = props;

	const [internalActiveIndex, internalSetActiveIndex] = useState(0, S('Composite:active'));
	const activeIndex = externalActiveIndex != null ? externalActiveIndex : internalActiveIndex;
	const onNavigate = useEffectEvent(
		externalSetActiveIndex != null ? externalSetActiveIndex : internalSetActiveIndex,
		S('Composite:nav'),
	);
	const elementsRef = useRef<Array<HTMLElement | null>>([], S('Composite:els'));
	const renderElementProps: any = render && typeof render !== 'function' ? render.props : {};
	const contextValue = useMemo<CompositeContextValue>(
		() => ({ activeIndex, onNavigate }),
		[activeIndex, onNavigate],
		S('Composite:ctx'),
	);
	const isGrid = cols > 1;

	function handleKeyDown(event: KeyboardEvent) {
		if (!allKeys.includes(event.key)) return;
		let nextIndex = activeIndex;
		const minIndex = getMinListIndex(elementsRef, disabledIndices);
		const maxIndex = getMaxListIndex(elementsRef, disabledIndices);
		const horizontalEndKey = rtl ? ARROW_LEFT : ARROW_RIGHT;
		const horizontalStartKey = rtl ? ARROW_RIGHT : ARROW_LEFT;
		if (isGrid) {
			const sizes =
				itemSizes ||
				Array.from({ length: elementsRef.current.length }, () => ({ width: 1, height: 1 }));
			const cellMap = createGridCellMap(sizes, cols, dense);
			const minGridIndex = cellMap.findIndex(
				(index) => index != null && !isListIndexDisabled(elementsRef, index, disabledIndices),
			);
			const maxGridIndex = cellMap.reduce<number>(
				(foundIndex, index, cellIndex) =>
					index != null && !isListIndexDisabled(elementsRef, index, disabledIndices)
						? cellIndex
						: foundIndex,
				-1,
			);
			const maybeNextIndex =
				cellMap[
					getGridNavigatedIndex(
						{
							current: cellMap.map((itemIndex) =>
								itemIndex ? elementsRef.current[itemIndex] : null,
							),
						},
						{
							event,
							orientation,
							loop,
							rtl,
							cols,
							disabledIndices: getGridCellIndices(
								[
									...((typeof disabledIndices !== 'function' ? disabledIndices : null) ||
										elementsRef.current.map((_, index) =>
											isListIndexDisabled(elementsRef, index, disabledIndices) ? index : undefined,
										)),
									undefined,
								],
								cellMap,
							),
							minIndex: minGridIndex,
							maxIndex: maxGridIndex,
							prevIndex: getGridCellIndexOfCorner(
								activeIndex > maxIndex ? minIndex : activeIndex,
								sizes,
								cellMap,
								cols,
								event.key === ARROW_DOWN ? 'bl' : event.key === horizontalEndKey ? 'tr' : 'tl',
							),
						},
					)
				];
			if (maybeNextIndex != null) {
				nextIndex = maybeNextIndex;
			}
		}
		const toEndKeys = {
			horizontal: [horizontalEndKey],
			vertical: [ARROW_DOWN],
			both: [horizontalEndKey, ARROW_DOWN],
		}[orientation];
		const toStartKeys = {
			horizontal: [horizontalStartKey],
			vertical: [ARROW_UP],
			both: [horizontalStartKey, ARROW_UP],
		}[orientation];
		const preventedKeys = isGrid
			? allKeys
			: {
					horizontal: horizontalKeys,
					vertical: verticalKeys,
					both: allKeys,
				}[orientation];
		if (nextIndex === activeIndex && [...toEndKeys, ...toStartKeys].includes(event.key)) {
			if (loop && nextIndex === maxIndex && toEndKeys.includes(event.key)) {
				nextIndex = minIndex;
			} else if (loop && nextIndex === minIndex && toStartKeys.includes(event.key)) {
				nextIndex = maxIndex;
			} else {
				nextIndex = findNonDisabledListIndex(elementsRef, {
					startingIndex: nextIndex,
					decrement: toStartKeys.includes(event.key),
					disabledIndices,
				});
			}
		}
		if (nextIndex !== activeIndex && !isIndexOutOfListBounds(elementsRef, nextIndex)) {
			event.stopPropagation();
			if (preventedKeys.includes(event.key)) {
				event.preventDefault();
			}
			onNavigate(nextIndex);
			elementsRef.current[nextIndex]?.focus();
		}
	}

	const computedProps = {
		...domProps,
		...renderElementProps,
		ref: forwardedRef,
		'aria-orientation': orientation === 'both' ? undefined : orientation,
		onKeyDown(e: KeyboardEvent) {
			domProps.onKeyDown?.(e as KeyboardEvent & { currentTarget: HTMLElement & EventTarget });
			renderElementProps.onKeyDown?.(e);
			handleKeyDown(e);
		},
	};

	return createElement(CompositeContext.Provider, {
		value: contextValue,
		children: createElement(FloatingList, {
			elementsRef,
			children: renderJsx(render, computedProps),
		}),
	});
}

export interface CompositeItemProps {
	/**
	 * Determines the element to render.
	 * @example
	 * ```jsx
	 * <CompositeItem render={<li />} />
	 * <CompositeItem render={(htmlProps) => <li {...htmlProps} />} />
	 * ```
	 */
	render?: RenderProp;
}

/**
 * @see https://floating-ui.com/docs/Composite
 */
export function CompositeItem(
	props: CompositeItemProps & HTMLProps<HTMLElement> & { ref?: CompositeRef },
): OctaneNode {
	const render = props.render;
	const forwardedRef = props.ref;
	const { render: _r, ref: _ref, ...domProps } = props;
	const renderElementProps: any = render && typeof render !== 'function' ? render.props : {};
	const { activeIndex, onNavigate } = useContext(CompositeContext);
	const { ref, index } = useListItem(S('CompositeItem:listItem'));
	const mergedRef = useMergeRefs(
		[ref, forwardedRef, renderElementProps.ref],
		S('CompositeItem:merge'),
	);
	const isActive = activeIndex === index;
	const computedProps = {
		...domProps,
		...renderElementProps,
		ref: mergedRef,
		tabIndex: isActive ? 0 : -1,
		'data-active': isActive ? '' : undefined,
		onFocus(e: FocusEvent) {
			domProps.onFocus?.(e as FocusEvent & { currentTarget: HTMLElement & EventTarget });
			renderElementProps.onFocus?.(e);
			onNavigate(index);
		},
	};
	return renderJsx(render, computedProps);
}
