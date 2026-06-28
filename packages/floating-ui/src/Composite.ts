// Ported from @floating-ui/react Composite + CompositeItem — a single tab-stop whose
// items are arrow-key navigated (list nav outside a floating context). `.ts`
// components via createElement; React forwardRef → props.ref. `renderJsx` supports the
// `render` prop (a function, an element to clone, or a default <div>); octane has no
// cloneElement, so it's implemented locally over createElement.
import { createContext, createElement, useContext, useMemo, useRef, useState } from 'octane';

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
} from './utils';

const ARROW_LEFT = 'ArrowLeft';
const ARROW_RIGHT = 'ArrowRight';
const ARROW_UP = 'ArrowUp';
const ARROW_DOWN = 'ArrowDown';
const horizontalKeys = [ARROW_LEFT, ARROW_RIGHT];
const verticalKeys = [ARROW_UP, ARROW_DOWN];
const allKeys = [...horizontalKeys, ...verticalKeys];

function cloneElement(el: any, props: any): any {
	return createElement(el.type, { ...el.props, ...props });
}

function renderJsx(render: any, computedProps: any): any {
	if (typeof render === 'function') {
		return render(computedProps);
	}
	if (render) {
		return cloneElement(render, computedProps);
	}
	return createElement('div', { ...computedProps });
}

export const CompositeContext = createContext<any>({
	activeIndex: 0,
	onNavigate: () => {},
});

export function Composite(props: any): any {
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
	const elementsRef = useRef<any[]>([], S('Composite:els'));
	const renderElementProps = render && typeof render !== 'function' ? render.props : {};
	const contextValue = useMemo(
		() => ({ activeIndex, onNavigate }),
		[activeIndex, onNavigate],
		S('Composite:ctx'),
	);
	const isGrid = cols > 1;

	function handleKeyDown(event: any) {
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
			const maxGridIndex = cellMap.reduce(
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
										elementsRef.current.map((_: any, index: number) =>
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
		}[orientation as 'horizontal' | 'vertical' | 'both'];
		const toStartKeys = {
			horizontal: [horizontalStartKey],
			vertical: [ARROW_UP],
			both: [horizontalStartKey, ARROW_UP],
		}[orientation as 'horizontal' | 'vertical' | 'both'];
		const preventedKeys = isGrid
			? allKeys
			: {
					horizontal: horizontalKeys,
					vertical: verticalKeys,
					both: allKeys,
				}[orientation as 'horizontal' | 'vertical' | 'both'];
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
		onKeyDown(e: any) {
			domProps.onKeyDown?.(e);
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

export function CompositeItem(props: any): any {
	const render = props.render;
	const forwardedRef = props.ref;
	const { render: _r, ref: _ref, ...domProps } = props;
	const renderElementProps = render && typeof render !== 'function' ? render.props : {};
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
		onFocus(e: any) {
			domProps.onFocus?.(e);
			renderElementProps.onFocus?.(e);
			onNavigate(index);
		},
	};
	return renderJsx(render, computedProps);
}
