import type { Assert, Equal } from '../../../scripts/react-port/type-assertions';
import * as WindowBinding from 'react-window';

type AlignContract = Assert<
	Equal<WindowBinding.Align, 'auto' | 'center' | 'end' | 'smart' | 'start'>
>;
type CellContract = Assert<
	Equal<WindowBinding.CellComponentProps<{ label: string }>['label'], string>
>;
type RowContract = Assert<
	Equal<WindowBinding.RowComponentProps<{ label: string }>['index'], number>
>;
type DynamicContract = Assert<
	Equal<ReturnType<WindowBinding.DynamicRowHeight['getAverageRowHeight']>, number>
>;
type GridPropsContract = Assert<
	Equal<WindowBinding.GridProps<object>['defaultWidth'], number | undefined>
>;
type ListPropsContract = Assert<
	Equal<WindowBinding.ListProps<object>['defaultHeight'], number | undefined>
>;
type GridContract = Assert<Equal<Parameters<typeof WindowBinding.Grid>[0]['rowCount'], number>>;
type ListContract = Assert<Equal<Parameters<typeof WindowBinding.List>[0]['rowCount'], number>>;
type ScrollbarContract = Assert<Equal<ReturnType<typeof WindowBinding.getScrollbarSize>, number>>;
type DynamicHookContract = Assert<
	Equal<ReturnType<typeof WindowBinding.useDynamicRowHeight>, WindowBinding.DynamicRowHeight>
>;
const gridRef = WindowBinding.useGridRef(null);
const listRef = WindowBinding.useListRef(null);
const [gridApi] = WindowBinding.useGridCallbackRef(null);
const [listApi] = WindowBinding.useListCallbackRef(null);
type GridRefContract = Assert<
	Equal<typeof gridRef.current, WindowBinding.GridImperativeAPI | null>
>;
type ListRefContract = Assert<
	Equal<typeof listRef.current, WindowBinding.ListImperativeAPI | null>
>;
type GridCallbackContract = Assert<Equal<typeof gridApi, WindowBinding.GridImperativeAPI | null>>;
type ListCallbackContract = Assert<Equal<typeof listApi, WindowBinding.ListImperativeAPI | null>>;
type GridApiContract = Assert<
	Equal<Parameters<WindowBinding.GridImperativeAPI['scrollToCell']>[0]['columnIndex'], number>
>;
type ListApiContract = Assert<
	Equal<Parameters<WindowBinding.ListImperativeAPI['scrollToRow']>[0]['index'], number>
>;
// @ts-expect-error A grid scroll requires both coordinates.
gridApi?.scrollToCell({ columnIndex: 1 });
// @ts-expect-error Dynamic row measurement requires a numeric initial height.
WindowBinding.useDynamicRowHeight({ defaultRowHeight: '30' });

type DynamicHookAverageContract = Assert<
	Equal<
		ReturnType<ReturnType<typeof WindowBinding.useDynamicRowHeight>['getAverageRowHeight']>,
		number
	>
>;
type GridRefShapeContract = Assert<
	Equal<
		keyof NonNullable<ReturnType<typeof WindowBinding.useGridRef>['current']>,
		'element' | 'scrollToCell' | 'scrollToColumn' | 'scrollToRow'
	>
>;
type ListRefShapeContract = Assert<
	Equal<
		keyof NonNullable<ReturnType<typeof WindowBinding.useListRef>['current']>,
		'element' | 'scrollToRow'
	>
>;
type GridCallbackShapeContract = Assert<
	Equal<
		keyof NonNullable<ReturnType<typeof WindowBinding.useGridCallbackRef>[0]>,
		'element' | 'scrollToCell' | 'scrollToColumn' | 'scrollToRow'
	>
>;
type ListCallbackShapeContract = Assert<
	Equal<
		keyof NonNullable<ReturnType<typeof WindowBinding.useListCallbackRef>[0]>,
		'element' | 'scrollToRow'
	>
>;

type GridClassNameContract = Assert<
	Equal<WindowBinding.GridProps<object>['className'], string | undefined>
>;
type ListClassNameContract = Assert<
	Equal<WindowBinding.ListProps<object>['className'], string | undefined>
>;
