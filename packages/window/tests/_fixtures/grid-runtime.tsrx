import { Grid, useGridCallbackRef, useGridRef } from '../../src';

export const gridRuntimeEvents: {
	ranges: Array<{
		visible: {
			columnStartIndex: number;
			columnStopIndex: number;
			rowStartIndex: number;
			rowStopIndex: number;
		};
		overscan: {
			columnStartIndex: number;
			columnStopIndex: number;
			rowStartIndex: number;
			rowStopIndex: number;
		};
	}>;
	ref: ReturnType<typeof useGridRef> | null;
} = { ranges: [], ref: null };

export const gridHookInitializerEvents: {
	callbackDirect: unknown;
	callbackLazy: unknown;
	ref: unknown;
} = { callbackDirect: null, callbackLazy: null, ref: null };

export function resetGridRuntimeEvents() {
	gridRuntimeEvents.ranges.length = 0;
	gridRuntimeEvents.ref = null;
	gridHookInitializerEvents.callbackDirect = null;
	gridHookInitializerEvents.callbackLazy = null;
	gridHookInitializerEvents.ref = null;
}

export function GridHookInitializerFixture() @{
	const initialApi = { kind: 'grid-initial-api' } as any;
	const initialLazyApi = { kind: 'grid-lazy-api' } as any;
	const ref = useGridRef(initialApi);
	const [callbackDirect] = useGridCallbackRef(initialApi);
	const [callbackLazy] = useGridCallbackRef(() => initialLazyApi);
	gridHookInitializerEvents.ref = ref.current;
	gridHookInitializerEvents.callbackDirect = callbackDirect;
	gridHookInitializerEvents.callbackLazy = callbackLazy;
	<div data-testid="grid-hook-initializers" />
}

function Cell({ ariaAttributes, columnIndex, label, rowIndex, style }: any) @{
	<div
		{...ariaAttributes}
		data-cell={`${rowIndex}:${columnIndex}`}
		style={style}
	>{`${label} ${rowIndex}:${columnIndex}`}</div>
}

export function GridRuntimeFixture() @{
	const gridRef = useGridRef(null);
	gridRuntimeEvents.ref = gridRef;

	<Grid
		cellComponent={Cell}
		cellProps={{ label: 'Cell' }}
		columnCount={100}
		columnWidth={20}
		data-testid="grid"
		gridRef={gridRef}
		onCellsRendered={(visible, overscan) => {
			gridRuntimeEvents.ranges.push({ visible, overscan });
		}}
		overscanCount={1}
		rowCount={100}
		rowHeight={20}
		style={{ height: 100, width: 100 }}
	/>
}
