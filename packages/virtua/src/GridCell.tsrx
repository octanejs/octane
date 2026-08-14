import { memo, useMemo, useRef, type OctaneNode } from 'octane';
import type { OctaneElement } from 'octane/jsx-runtime';
import type { GridResizer } from 'virtua/unstable_core';
import type { CSSProperties, CustomCellComponent } from './VGrid.tsrx';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.js';
import { refKey } from './utils.js';

type GridCellProps = {
	_children: OctaneNode;
	_resizer: GridResizer;
	_rowIndex: number;
	_colIndex: number;
	_top: number;
	_left: number;
	_height: number;
	_width: number;
	_hide: boolean;
	_element: 'div' | CustomCellComponent;
};

/** @internal */
export const GridCell = /*#__PURE__*/ memo(({
	_children: children,
	_resizer: resizer,
	_rowIndex: rowIndex,
	_colIndex: colIndex,
	_top: top,
	_left: left,
	_height: height,
	_width: width,
	_hide: hide,
	_element: Element,
}: GridCellProps): OctaneElement => {
	const ref = useRef<HTMLDivElement | null>(null);

	// The coordinates can change when rows or columns are inserted at the start.
	useIsomorphicLayoutEffect(() => resizer.$observeItem(ref[refKey]!, rowIndex, colIndex), [
		colIndex,
		rowIndex,
	]);

	const style = useMemo((): CSSProperties => {
		return {
			contain: 'layout style',
			display: 'grid',
			position: 'absolute',
			top,
			left,
			visibility: hide ? 'hidden' : undefined,
			minHeight: height,
			minWidth: width,
		};
	}, [top, left, width, height, hide]);

	return <Element ref={ref} style={style}>{children}</Element>;
});
