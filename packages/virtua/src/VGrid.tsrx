import {
	flushSync,
	useImperativeHandle,
	useMemo,
	useReducer,
	useRef,
	type OctaneNode,
} from 'octane';
import type { Octane, OctaneElement } from 'octane/jsx-runtime';
import {
	ACTION_ITEMS_LENGTH_CHANGE,
	UPDATE_SCROLL_END_EVENT,
	UPDATE_SCROLL_EVENT,
	UPDATE_VIRTUAL_STATE,
	createGridResizer,
	createGridScroller,
	createVirtualStore,
	getScrollSize,
} from 'virtua/unstable_core';
import { GridCell } from './GridCell.tsrx';
import type { ImperativeRef, ViewportComponentAttributes } from './types.js';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.js';
import { useLatestRef } from './useLatestRef.js';
import { useStatic } from './useStatic.js';
import { refKey } from './utils.js';

export type CSSProperties =
	Exclude<Octane.JSX.IntrinsicElements['div']['style'], string | undefined>;

/** Props of a customized cell component for {@link VGrid}. */
export interface CustomCellComponentProps {
	style: CSSProperties;
	children: OctaneNode;
	ref?: ImperativeRef<HTMLDivElement>;
}

export type CustomCellComponent = (props: CustomCellComponentProps) => OctaneElement;

export type VGridItemResize = readonly [index: number, size: number];

/** Methods of {@link VGrid}. */
export interface VGridHandle {
	readonly scrollTop: number;
	readonly scrollLeft: number;
	readonly scrollHeight: number;
	readonly scrollWidth: number;
	readonly viewportHeight: number;
	readonly viewportWidth: number;
	findRowIndex(offset: number): number;
	findColIndex(offset: number): number;
	getRowOffset(index: number): number;
	getColOffset(index: number): number;
	getRowSize(index: number): number;
	getColSize(index: number): number;
	resizeCols(cols: VGridItemResize[]): void;
	resizeRows(rows: VGridItemResize[]): void;
	scrollToIndex(indexX?: number, indexY?: number): void;
	scrollTo(offsetX?: number, offsetY?: number): void;
	scrollBy(offsetX?: number, offsetY?: number): void;
}

/** Props of {@link VGrid}. */
export interface VGridProps extends ViewportComponentAttributes {
	children: (arg: { rowIndex: number; colIndex: number }) => OctaneNode;
	row: number;
	col: number;
	cellHeight?: number;
	cellWidth?: number;
	bufferSize?: number;
	ssrRowCount?: number;
	ssrColCount?: number;
	item?: keyof Octane.JSX.IntrinsicElements | CustomCellComponent;
	domRef?: ImperativeRef<HTMLDivElement>;
	onScroll?: (offset: number) => void;
	onScrollEnd?: () => void;
	ref?: ImperativeRef<VGridHandle>;
}

const gridKey = (rowIndex: number, colIndex: number) => `${rowIndex}-${colIndex}`;

/** Virtualized grid component. See {@link VGridProps} and {@link VGridHandle}. */
export function VGrid({
	children,
	row: rowCount,
	col: colCount,
	cellHeight = 40,
	cellWidth = 100,
	bufferSize,
	ssrRowCount,
	ssrColCount,
	item: ItemElement = 'div',
	domRef,
	onScroll: onScrollProp,
	onScrollEnd: onScrollEndProp,
	ref,
	style,
	...attrs
}: VGridProps): OctaneElement {
	const [rowStore, colStore, resizer, scroller] = useStatic(() => {
		const nextRowStore = createVirtualStore(rowCount, cellHeight, ssrRowCount);
		const nextColStore = createVirtualStore(colCount, cellWidth, ssrColCount);
		return [
			nextRowStore,
			nextColStore,
			createGridResizer(nextRowStore, nextColStore),
			createGridScroller(nextRowStore, nextColStore),
		] as const;
	});

	if (rowCount !== rowStore.$getItemsLength()) {
		rowStore.$update(ACTION_ITEMS_LENGTH_CHANGE, [rowCount]);
	}
	if (colCount !== colStore.$getItemsLength()) {
		colStore.$update(ACTION_ITEMS_LENGTH_CHANGE, [colCount]);
	}

	const [rowStateVersion, rowRerender] = useReducer(
		rowStore.$getStateVersion,
		undefined,
		rowStore.$getStateVersion,
	);
	const [colStateVersion, colRerender] = useReducer(
		colStore.$getStateVersion,
		undefined,
		colStore.$getStateVersion,
	);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const onScroll = useLatestRef(onScrollProp);
	const onScrollEnd = useLatestRef(onScrollEndProp);

	useIsomorphicLayoutEffect(() => {
		// Reason: store subscriptions must exist before observers can synchronously dispatch.
		rowStore.$subscribe(UPDATE_VIRTUAL_STATE, (sync: boolean) => {
			if (sync) flushSync(() => rowRerender(undefined));
			else rowRerender(undefined);
		});
		colStore.$subscribe(UPDATE_VIRTUAL_STATE, (sync: boolean) => {
			if (sync) flushSync(() => colRerender(undefined));
			else colRerender(undefined);
		});
		rowStore.$subscribe(UPDATE_SCROLL_EVENT, () => {
			onScroll[refKey]?.(rowStore.$getScrollOffset());
		});
		rowStore.$subscribe(UPDATE_SCROLL_END_EVENT, () => {
			onScrollEnd[refKey]?.();
		});

		const container = containerRef[refKey]!;
		const viewport = container.parentElement!;
		resizer.$observeRoot(viewport);
		scroller.$observe(container, viewport);
		return () => {
			rowStore.$dispose();
			colStore.$dispose();
			resizer.$dispose();
			scroller.$dispose();
		};
	}, []);

	useIsomorphicLayoutEffect(() => {
		scroller.$fixScrollJump();
	}, [rowStateVersion, colStateVersion]);

	useImperativeHandle(
		ref,
		() => ({
			get scrollTop() {
				return rowStore.$getScrollOffset();
			},
			get scrollLeft() {
				return colStore.$getScrollOffset();
			},
			get scrollHeight() {
				return getScrollSize(rowStore);
			},
			get scrollWidth() {
				return getScrollSize(colStore);
			},
			get viewportHeight() {
				return rowStore.$getViewportSize();
			},
			get viewportWidth() {
				return colStore.$getViewportSize();
			},
			findRowIndex: rowStore.$findItemIndex,
			findColIndex: colStore.$findItemIndex,
			getRowOffset: rowStore.$getItemOffset,
			getColOffset: colStore.$getItemOffset,
			getRowSize: rowStore.$getItemSize,
			getColSize: colStore.$getItemSize,
			resizeCols: resizer.$resizeCols,
			resizeRows: resizer.$resizeRows,
			scrollToIndex: scroller.$scrollToIndex,
			scrollTo: scroller.$scrollTo,
			scrollBy: scroller.$scrollBy,
		}),
		[],
	);

	const render = useMemo(() => {
		const cache = new Map<string, OctaneNode>();
		return (rowIndex: number, colIndex: number) => {
			const key = gridKey(rowIndex, colIndex);
			let element = cache.get(key);
			if (element === undefined) {
				element = children({ rowIndex, colIndex });
				cache.set(key, element);
			}
			return element;
		};
	}, [children]);

	const isNegative = scroller.$isNegative();
	const [startRowIndex, endRowIndex] = rowStore.$getRange(bufferSize);
	const [startColIndex, endColIndex] = colStore.$getRange(bufferSize);
	const items: OctaneElement[] = [];

	for (let rowIndex = startRowIndex; rowIndex <= endRowIndex; rowIndex++) {
		for (let colIndex = startColIndex; colIndex <= endColIndex; colIndex++) {
			items.push(
				<GridCell
					key={gridKey(rowIndex, colIndex)}
					_resizer={resizer}
					_rowIndex={rowIndex}
					_colIndex={colIndex}
					_top={rowStore.$getItemOffset(rowIndex)}
					_left={colStore.$getItemOffset(colIndex, isNegative)}
					_height={rowStore.$getItemSize(rowIndex)}
					_width={colStore.$getItemSize(colIndex)}
					_hide={rowStore.$isUnmeasuredItem(rowIndex) || colStore.$isUnmeasuredItem(colIndex)}
					_element={ItemElement as 'div' | CustomCellComponent}
					_children={render(rowIndex, colIndex)}
				/>,
			);
		}
	}

	return <div
		ref={domRef}
		{...attrs}
		style={{
			overflow: 'auto',
			contain: 'strict',
			width: '100%',
			height: '100%',
			...style,
		}}
	>
		<div
			ref={containerRef}
			style={{
				contain: 'size style',
				overflowAnchor: 'none',
				flex: 'none',
				position: 'relative',
				width: getScrollSize(colStore),
				height: getScrollSize(rowStore),
				pointerEvents: rowStore.$isScrolling() || colStore.$isScrolling() ? 'none' : undefined,
			}}
		>{items}</div>
	</div>;
}
