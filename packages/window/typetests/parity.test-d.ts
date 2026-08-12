import type { RefObject } from 'react';
import {
	type Align,
	type CellComponentProps,
	type DynamicRowHeight,
	Grid,
	type GridImperativeAPI,
	type GridProps,
	List,
	type ListImperativeAPI,
	type ListProps,
	type RowComponentProps,
	getScrollbarSize,
	useDynamicRowHeight,
	useGridCallbackRef,
	useGridRef,
	useListCallbackRef,
	useListRef,
} from 'react-window-under-test';

// @parity-case types:react-window-pristine:component-props
// @parity-case types:react-window-pristine:list-grid-props
// @parity-case types:react-window-pristine:components
// @parity-case types:react-window-pristine:utilities
// @parity-case types:react-window-pristine:dynamic-height
// @parity-case types:react-window-pristine:ref-hooks
// @parity-case types:react-window-pristine:imperative-api
// @parity-case types:react-window-pristine:forbidden-generated-props
// @parity-case types:react-window-pristine:missing-grid-coordinate
// @parity-case types:react-window-pristine:absent-v1-api
// @parity-case types:react-window-adapted:component-props
// @parity-case types:react-window-adapted:list-grid-props
// @parity-case types:react-window-adapted:components
// @parity-case types:react-window-adapted:utilities
// @parity-case types:react-window-adapted:dynamic-height
// @parity-case types:react-window-adapted:ref-hooks
// @parity-case types:react-window-adapted:imperative-api
// @parity-case types:react-window-adapted:forbidden-generated-props
// @parity-case types:react-window-adapted:missing-grid-coordinate
// @parity-case types:react-window-adapted:absent-v1-api

declare function expectType<T>(value: T): void;

type RowData = { label: string };
type CellData = { value: number };

// @type-parity-group component-props
const RowComponent = (props: RowComponentProps<RowData>) => {
	expectType<number>(props.index);
	expectType<string>(props.label);
	expectType<'listitem'>(props.ariaAttributes.role);
	return null;
};

const CellComponent = (props: CellComponentProps<CellData>) => {
	expectType<number>(props.columnIndex);
	expectType<number>(props.rowIndex);
	expectType<number>(props.value);
	expectType<'gridcell'>(props.ariaAttributes.role);
	return null;
};

// @type-parity-group list-grid-props
const listProps: ListProps<RowData> = {
	defaultHeight: 200,
	rowComponent: RowComponent,
	rowCount: 100,
	rowHeight: 24,
	rowKey: (index, data) => `${data.label}-${index}`,
	rowProps: { label: 'row' },
};

const gridProps: GridProps<CellData> = {
	cellComponent: CellComponent,
	cellProps: { value: 1 },
	columnCount: 4,
	columnWidth: (index, data) => index + data.value,
	rowCount: 100,
	rowHeight: 24,
	rowKey: ({ data, rowIndex }) => `${data.value}-${rowIndex}`,
};

// @type-parity-group components
expectType<ReturnType<typeof List>>(List(listProps));
expectType<ReturnType<typeof Grid>>(Grid(gridProps));

// @type-parity-group utilities
expectType<number>(getScrollbarSize());
expectType<number>(getScrollbarSize(true));

const align: Align = 'smart';
expectType<Align>(align);

// @type-parity-group dynamic-height
const dynamicHeight: DynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: 24, key: 'rows' });
expectType<number>(dynamicHeight.getAverageRowHeight());
expectType<number | undefined>(dynamicHeight.getRowHeight(0));
// @ts-expect-error useDynamicRowHeight accepts exactly one public argument
useDynamicRowHeight({ defaultRowHeight: 24 }, Symbol('compiler-slot'));

// @type-parity-group ref-hooks
const gridRef = useGridRef(null);
const listRef = useListRef(null);
expectType<RefObject<GridImperativeAPI | null>>(gridRef);
expectType<RefObject<ListImperativeAPI | null>>(listRef);

const [gridApi, setGridApi] = useGridCallbackRef(null);
const [listApi, setListApi] = useListCallbackRef(null);
expectType<GridImperativeAPI | null>(gridApi);
expectType<ListImperativeAPI | null>(listApi);
expectType<(value: GridImperativeAPI | null) => void>(setGridApi);
expectType<(value: ListImperativeAPI | null) => void>(setListApi);
// @ts-expect-error useGridRef accepts exactly one public argument
useGridRef(null, Symbol('compiler-slot'));
// @ts-expect-error useListRef accepts exactly one public argument
useListRef(null, Symbol('compiler-slot'));
// @ts-expect-error useGridCallbackRef accepts at most one public argument
useGridCallbackRef(null, Symbol('compiler-slot'));
// @ts-expect-error useListCallbackRef accepts at most one public argument
useListCallbackRef(null, Symbol('compiler-slot'));

// @type-parity-group imperative-api
gridApi?.scrollToCell({ columnIndex: 2, rowIndex: 3 });
listApi?.scrollToRow({ align: 'center', index: 3 });

// @type-parity-group forbidden-generated-props
const invalidListProps: ListProps<{ style: string }> = {
	...listProps,
	// @ts-expect-error rowProps may not override generated style
	rowProps: { style: 'forbidden' },
};
void invalidListProps;

const invalidGridProps: GridProps<{ columnIndex: number }> = {
	...gridProps,
	// @ts-expect-error cellProps may not override generated columnIndex
	cellProps: { columnIndex: 1 },
};
void invalidGridProps;

// @type-parity-group missing-grid-coordinate
// @ts-expect-error scrollToCell requires both coordinates
gridApi?.scrollToCell({ rowIndex: 1 });

// @type-parity-group absent-v1-api
// @ts-expect-error v1 API names are intentionally absent from the v2.3.0 contract
import { FixedSizeList } from 'react-window-under-test';
void FixedSizeList;
