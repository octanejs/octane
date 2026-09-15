import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import type { ExpectedContracts } from '../../typetests/expected-contracts';
import type { OctaneNode } from 'octane';
type Person = { id: string; name: string };
type Features = Actual0.StockFeatures;
import * as Actual0 from '@tanstack/react-table';
import * as Actual1 from '@tanstack/react-table/flex-render';
import * as Actual2 from '@tanstack/react-table/legacy';
import * as Actual3 from '@tanstack/react-table/static-functions';
import * as Actual4 from '@tanstack/react-table/experimental-worker-plugin';
type Contract_0_AppCellComponent = Assert<
	Equal<
		Parameters<
			Actual0.AppCellComponent<Features, Person, { Label: (props: { value: string }) => string }>
		>['length'],
		ExpectedContracts['0_AppCellComponent']
	>
>;
type Contract_0_AppCellContext = Assert<
	Equal<
		keyof Actual0.AppCellContext<
			Features,
			Person,
			string,
			{ Label: (props: { value: string }) => string }
		>,
		ExpectedContracts['0_AppCellContext']
	>
>;
type Contract_0_AppCellPropsWithSelector = Assert<
	Equal<
		keyof Actual0.AppCellPropsWithSelector<
			Features,
			Person,
			string,
			{ Label: (props: { value: string }) => string },
			{ pageIndex: number }
		>,
		ExpectedContracts['0_AppCellPropsWithSelector']
	>
>;
type Contract_0_AppCellPropsWithoutSelector = Assert<
	Equal<
		keyof Actual0.AppCellPropsWithoutSelector<
			Features,
			Person,
			string,
			{ Label: (props: { value: string }) => string }
		>,
		ExpectedContracts['0_AppCellPropsWithoutSelector']
	>
>;
type Contract_0_AppColumnDefBase = Assert<
	Equal<
		keyof Actual0.AppColumnDefBase<
			Features,
			Person,
			string,
			{ Label: (props: { value: string }) => string },
			{ Label: (props: { value: string }) => string }
		>,
		ExpectedContracts['0_AppColumnDefBase']
	>
>;
type Contract_0_AppColumnDefTemplate = Assert<
	Equal<
		keyof Actual0.AppColumnDefTemplate<{ value: string }>,
		ExpectedContracts['0_AppColumnDefTemplate']
	>
>;
type Contract_0_AppColumnHelper = Assert<
	Equal<
		keyof Actual0.AppColumnHelper<
			Features,
			Person,
			{ Label: (props: { value: string }) => string },
			{ Label: (props: { value: string }) => string }
		>,
		ExpectedContracts['0_AppColumnHelper']
	>
>;
type Contract_0_AppDisplayColumnDef = Assert<
	Equal<
		keyof Actual0.AppDisplayColumnDef<
			Features,
			Person,
			{ Label: (props: { value: string }) => string },
			{ Label: (props: { value: string }) => string }
		>,
		ExpectedContracts['0_AppDisplayColumnDef']
	>
>;
type Contract_0_AppGroupColumnDef = Assert<
	Equal<
		keyof Actual0.AppGroupColumnDef<
			Features,
			Person,
			{ Label: (props: { value: string }) => string },
			{ Label: (props: { value: string }) => string }
		>,
		ExpectedContracts['0_AppGroupColumnDef']
	>
>;
type Contract_0_AppHeaderComponent = Assert<
	Equal<
		Parameters<
			Actual0.AppHeaderComponent<Features, Person, { Label: (props: { value: string }) => string }>
		>['length'],
		ExpectedContracts['0_AppHeaderComponent']
	>
>;
type Contract_0_AppHeaderContext = Assert<
	Equal<
		keyof Actual0.AppHeaderContext<
			Features,
			Person,
			string,
			{ Label: (props: { value: string }) => string }
		>,
		ExpectedContracts['0_AppHeaderContext']
	>
>;
type Contract_0_AppHeaderPropsWithSelector = Assert<
	Equal<
		keyof Actual0.AppHeaderPropsWithSelector<
			Features,
			Person,
			string,
			{ Label: (props: { value: string }) => string },
			{ pageIndex: number }
		>,
		ExpectedContracts['0_AppHeaderPropsWithSelector']
	>
>;
type Contract_0_AppHeaderPropsWithoutSelector = Assert<
	Equal<
		keyof Actual0.AppHeaderPropsWithoutSelector<
			Features,
			Person,
			string,
			{ Label: (props: { value: string }) => string }
		>,
		ExpectedContracts['0_AppHeaderPropsWithoutSelector']
	>
>;
type Contract_0_AppReactTable = Assert<
	Equal<
		keyof Actual0.AppReactTable<
			Features,
			Person,
			{ pageIndex: number },
			{ Label: (props: { value: string }) => string },
			{ Label: (props: { value: string }) => string },
			{ Label: (props: { value: string }) => string }
		>,
		ExpectedContracts['0_AppReactTable']
	>
>;
type Contract_0_AppTableComponent = Assert<
	Equal<
		Parameters<Actual0.AppTableComponent<Features>>['length'],
		ExpectedContracts['0_AppTableComponent']
	>
>;
type Contract_0_AppTablePropsWithSelector = Assert<
	Equal<
		keyof Actual0.AppTablePropsWithSelector<Features, { pageIndex: number }>,
		ExpectedContracts['0_AppTablePropsWithSelector']
	>
>;
type Contract_0_AppTablePropsWithoutSelector = Assert<
	Equal<
		keyof Actual0.AppTablePropsWithoutSelector,
		ExpectedContracts['0_AppTablePropsWithoutSelector']
	>
>;
type Contract_0_CreateTableHookOptions = Assert<
	Equal<
		keyof Actual0.CreateTableHookOptions<
			Features,
			{ Label: (props: { value: string }) => string },
			{ Label: (props: { value: string }) => string },
			{ Label: (props: { value: string }) => string }
		>,
		ExpectedContracts['0_CreateTableHookOptions']
	>
>;
type Contract_0_CreateTableHookResult = Assert<
	Equal<
		keyof Actual0.CreateTableHookResult<
			Features,
			{ Label: (props: { value: string }) => string },
			{ Label: (props: { value: string }) => string },
			{ Label: (props: { value: string }) => string }
		>,
		ExpectedContracts['0_CreateTableHookResult']
	>
>;
type Contract_0_FlexRender = Assert<
	Equal<Parameters<typeof Actual0.FlexRender>['length'], ExpectedContracts['0_FlexRender']>
>;
type Contract_0_FlexRenderProps = Assert<
	Equal<keyof Actual0.FlexRenderProps<Features, Person>, ExpectedContracts['0_FlexRenderProps']>
>;
type Contract_0_ReactTable = Assert<
	Equal<keyof Actual0.ReactTable<Features, Person>, ExpectedContracts['0_ReactTable']>
>;
type Contract_0_Renderable = Assert<
	Equal<keyof Actual0.Renderable<{ value: string }>, ExpectedContracts['0_Renderable']>
>;
type Contract_0_Subscribe = Assert<
	Equal<Parameters<typeof Actual0.Subscribe>['length'], ExpectedContracts['0_Subscribe']>
>;
type Contract_0_SubscribeProps = Assert<
	Equal<keyof Actual0.SubscribeProps<Features>, ExpectedContracts['0_SubscribeProps']>
>;
type Contract_0_SubscribePropsWithSource = Assert<
	Equal<
		keyof Actual0.SubscribePropsWithSource<string>,
		ExpectedContracts['0_SubscribePropsWithSource']
	>
>;
type Contract_0_SubscribePropsWithSourceIdentity = Assert<
	Equal<
		keyof Actual0.SubscribePropsWithSourceIdentity<string>,
		ExpectedContracts['0_SubscribePropsWithSourceIdentity']
	>
>;
type Contract_0_SubscribePropsWithSourceWithSelector = Assert<
	Equal<
		keyof Actual0.SubscribePropsWithSourceWithSelector<string, { pageIndex: number }>,
		ExpectedContracts['0_SubscribePropsWithSourceWithSelector']
	>
>;
type Contract_0_SubscribePropsWithStore = Assert<
	Equal<
		keyof Actual0.SubscribePropsWithStore<Features, { pageIndex: number }>,
		ExpectedContracts['0_SubscribePropsWithStore']
	>
>;
type Contract_0_SubscribeSource = Assert<
	Equal<keyof Actual0.SubscribeSource<string>, ExpectedContracts['0_SubscribeSource']>
>;
type Contract_0_TableHookContexts = Assert<
	Equal<keyof Actual0.TableHookContexts<Features, Person>, ExpectedContracts['0_TableHookContexts']>
>;
type Contract_0_createTableHook = Assert<
	Equal<
		Parameters<typeof Actual0.createTableHook>['length'],
		ExpectedContracts['0_createTableHook']
	>
>;
type Contract_0_createTableHookContexts = Assert<
	Equal<
		Parameters<typeof Actual0.createTableHookContexts>['length'],
		ExpectedContracts['0_createTableHookContexts']
	>
>;
type Contract_0_flexRender = Assert<
	Equal<Parameters<typeof Actual0.flexRender>['length'], ExpectedContracts['0_flexRender']>
>;
type Contract_0_useTable = Assert<
	Equal<Parameters<typeof Actual0.useTable>['length'], ExpectedContracts['0_useTable']>
>;
type Contract_0_API = Assert<
	Equal<Actual0.API<[string, number], { sample: string }>, ExpectedContracts['0_API']>
>;
type Contract_0_APIObject = Assert<
	Equal<Actual0.APIObject<[string, number], { sample: string }>, ExpectedContracts['0_APIObject']>
>;
type Contract_0_AccessorColumnDef = Assert<
	Equal<Actual0.AccessorColumnDef<Features, Person>, ExpectedContracts['0_AccessorColumnDef']>
>;
type Contract_0_AccessorFn = Assert<
	Equal<Actual0.AccessorFn<Person>, ExpectedContracts['0_AccessorFn']>
>;
type Contract_0_AccessorFnColumnDef = Assert<
	Equal<Actual0.AccessorFnColumnDef<Features, Person>, ExpectedContracts['0_AccessorFnColumnDef']>
>;
type Contract_0_AccessorFnColumnDefBase = Assert<
	Equal<
		Actual0.AccessorFnColumnDefBase<Features, Person>,
		ExpectedContracts['0_AccessorFnColumnDefBase']
	>
>;
type Contract_0_AccessorKeyColumnDef = Assert<
	Equal<Actual0.AccessorKeyColumnDef<Features, Person>, ExpectedContracts['0_AccessorKeyColumnDef']>
>;
type Contract_0_AccessorKeyColumnDefBase = Assert<
	Equal<
		Actual0.AccessorKeyColumnDefBase<Features, Person>,
		ExpectedContracts['0_AccessorKeyColumnDefBase']
	>
>;
type Contract_0_AggregationContext = Assert<
	Equal<Actual0.AggregationContext<Features, Person>, ExpectedContracts['0_AggregationContext']>
>;
type Contract_0_AggregationFnDef = Assert<
	Equal<Actual0.AggregationFnDef, ExpectedContracts['0_AggregationFnDef']>
>;
type Contract_0_AggregationFnDescriptor = Assert<
	Equal<
		Actual0.AggregationFnDescriptor<Features, Person>,
		ExpectedContracts['0_AggregationFnDescriptor']
	>
>;
type Contract_0_AggregationFnListItem = Assert<
	Equal<
		Actual0.AggregationFnListItem<Features, Person>,
		ExpectedContracts['0_AggregationFnListItem']
	>
>;
type Contract_0_AggregationFnOption = Assert<
	Equal<Actual0.AggregationFnOption<Features, Person>, ExpectedContracts['0_AggregationFnOption']>
>;
type Contract_0_AggregationFnRef = Assert<
	Equal<Actual0.AggregationFnRef<Features, Person>, ExpectedContracts['0_AggregationFnRef']>
>;
type Contract_0_AggregationFns = Assert<
	Equal<Actual0.AggregationFns, ExpectedContracts['0_AggregationFns']>
>;
type Contract_0_AggregationMergeContext = Assert<
	Equal<
		Actual0.AggregationMergeContext<Features, Person, string, { sample: string }>,
		ExpectedContracts['0_AggregationMergeContext']
	>
>;
type Contract_0_AggregationResult = Assert<
	Equal<Actual0.AggregationResult<{ sample: string }>, ExpectedContracts['0_AggregationResult']>
>;
type Contract_0_AggregationResultOf = Assert<
	Equal<Actual0.AggregationResultOf<{ sample: string }>, ExpectedContracts['0_AggregationResultOf']>
>;
type Contract_0_AggregationValueContext = Assert<
	Equal<
		Actual0.AggregationValueContext<Features, Person>,
		ExpectedContracts['0_AggregationValueContext']
	>
>;
type Contract_0_AggregationValueOptions = Assert<
	Equal<
		Actual0.AggregationValueOptions<Features, Person>,
		ExpectedContracts['0_AggregationValueOptions']
	>
>;
type Contract_0_AggregationValueResult = Assert<
	Equal<Actual0.AggregationValueResult, ExpectedContracts['0_AggregationValueResult']>
>;
type Contract_0_Atoms = Assert<Equal<Actual0.Atoms<Features>, ExpectedContracts['0_Atoms']>>;
type Contract_0_Atoms_All = Assert<Equal<Actual0.Atoms_All, ExpectedContracts['0_Atoms_All']>>;
type Contract_0_BaseAtoms = Assert<
	Equal<Actual0.BaseAtoms<Features>, ExpectedContracts['0_BaseAtoms']>
>;
type Contract_0_BaseAtoms_All = Assert<
	Equal<Actual0.BaseAtoms_All, ExpectedContracts['0_BaseAtoms_All']>
>;
type Contract_0_BuiltInAggregationFn = Assert<
	Equal<Actual0.BuiltInAggregationFn, ExpectedContracts['0_BuiltInAggregationFn']>
>;
type Contract_0_BuiltInFilterFn = Assert<
	Equal<Actual0.BuiltInFilterFn, ExpectedContracts['0_BuiltInFilterFn']>
>;
type Contract_0_BuiltInSortFn = Assert<
	Equal<Actual0.BuiltInSortFn, ExpectedContracts['0_BuiltInSortFn']>
>;
type Contract_0_CachedRowModel_All = Assert<
	Equal<Actual0.CachedRowModel_All<Features>, ExpectedContracts['0_CachedRowModel_All']>
>;
type Contract_0_CachedRowModel_Core = Assert<
	Equal<Actual0.CachedRowModel_Core<Features, Person>, ExpectedContracts['0_CachedRowModel_Core']>
>;
type Contract_0_CachedRowModel_Expanded = Assert<
	Equal<
		Actual0.CachedRowModel_Expanded<Features, Person>,
		ExpectedContracts['0_CachedRowModel_Expanded']
	>
>;
type Contract_0_CachedRowModel_Faceted = Assert<
	Equal<
		Actual0.CachedRowModel_Faceted<Features, Person>,
		ExpectedContracts['0_CachedRowModel_Faceted']
	>
>;
type Contract_0_CachedRowModel_Filtered = Assert<
	Equal<
		Actual0.CachedRowModel_Filtered<Features, Person>,
		ExpectedContracts['0_CachedRowModel_Filtered']
	>
>;
type Contract_0_CachedRowModel_Grouped = Assert<
	Equal<
		Actual0.CachedRowModel_Grouped<Features, Person>,
		ExpectedContracts['0_CachedRowModel_Grouped']
	>
>;
type Contract_0_CachedRowModel_Paginated = Assert<
	Equal<
		Actual0.CachedRowModel_Paginated<Features, Person>,
		ExpectedContracts['0_CachedRowModel_Paginated']
	>
>;
type Contract_0_CachedRowModel_Sorted = Assert<
	Equal<
		Actual0.CachedRowModel_Sorted<Features, Person>,
		ExpectedContracts['0_CachedRowModel_Sorted']
	>
>;
type Contract_0_CachedRowModels = Assert<
	Equal<Actual0.CachedRowModels<Features, Person>, ExpectedContracts['0_CachedRowModels']>
>;
type Contract_0_CachedRowModels_FeatureMap = Assert<
	Equal<
		Actual0.CachedRowModels_FeatureMap<Features, Person>,
		ExpectedContracts['0_CachedRowModels_FeatureMap']
	>
>;
type Contract_0_Cell = Assert<Equal<Actual0.Cell<Features, Person>, ExpectedContracts['0_Cell']>>;
type Contract_0_CellContext = Assert<
	Equal<Actual0.CellContext<Features, Person>, ExpectedContracts['0_CellContext']>
>;
type Contract_0_CellData = Assert<Equal<Actual0.CellData, ExpectedContracts['0_CellData']>>;
type Contract_0_CellSelectionBounds = Assert<
	Equal<Actual0.CellSelectionBounds, ExpectedContracts['0_CellSelectionBounds']>
>;
type Contract_0_CellSelectionDirection = Assert<
	Equal<Actual0.CellSelectionDirection, ExpectedContracts['0_CellSelectionDirection']>
>;
type Contract_0_CellSelectionEdges = Assert<
	Equal<Actual0.CellSelectionEdges, ExpectedContracts['0_CellSelectionEdges']>
>;
type Contract_0_CellSelectionRange = Assert<
	Equal<Actual0.CellSelectionRange, ExpectedContracts['0_CellSelectionRange']>
>;
type Contract_0_CellSelectionRangeMode = Assert<
	Equal<Actual0.CellSelectionRangeMode, ExpectedContracts['0_CellSelectionRangeMode']>
>;
type Contract_0_CellSelectionRangeOperation = Assert<
	Equal<Actual0.CellSelectionRangeOperation, ExpectedContracts['0_CellSelectionRangeOperation']>
>;
type Contract_0_CellSelectionState = Assert<
	Equal<Actual0.CellSelectionState, ExpectedContracts['0_CellSelectionState']>
>;
type Contract_0_CellSpanIndex = Assert<
	Equal<Actual0.CellSpanIndex<Features, Person>, ExpectedContracts['0_CellSpanIndex']>
>;
type Contract_0_Cell_Cell = Assert<
	Equal<Actual0.Cell_Cell<Features, Person>, ExpectedContracts['0_Cell_Cell']>
>;
type Contract_0_Cell_CellSelection = Assert<
	Equal<Actual0.Cell_CellSelection, ExpectedContracts['0_Cell_CellSelection']>
>;
type Contract_0_Cell_CellSpanning = Assert<
	Equal<Actual0.Cell_CellSpanning, ExpectedContracts['0_Cell_CellSpanning']>
>;
type Contract_0_Cell_ColumnGrouping = Assert<
	Equal<Actual0.Cell_ColumnGrouping, ExpectedContracts['0_Cell_ColumnGrouping']>
>;
type Contract_0_Cell_Core = Assert<
	Equal<Actual0.Cell_Core<Features, Person>, ExpectedContracts['0_Cell_Core']>
>;
type Contract_0_Cell_CoreProperties = Assert<
	Equal<Actual0.Cell_CoreProperties<Features, Person>, ExpectedContracts['0_Cell_CoreProperties']>
>;
type Contract_0_Cell_FeatureMap = Assert<
	Equal<Actual0.Cell_FeatureMap, ExpectedContracts['0_Cell_FeatureMap']>
>;
type Contract_0_Cell_RowAggregation = Assert<
	Equal<Actual0.Cell_RowAggregation, ExpectedContracts['0_Cell_RowAggregation']>
>;
type Contract_0_ColSpanContext = Assert<
	Equal<Actual0.ColSpanContext<Features, Person>, ExpectedContracts['0_ColSpanContext']>
>;
type Contract_0_Column = Assert<
	Equal<Actual0.Column<Features, Person>, ExpectedContracts['0_Column']>
>;
type Contract_0_ColumnAggregationValue = Assert<
	Equal<Actual0.ColumnAggregationValue<Features>, ExpectedContracts['0_ColumnAggregationValue']>
>;
type Contract_0_ColumnDef = Assert<
	Equal<Actual0.ColumnDef<Features, Person>, ExpectedContracts['0_ColumnDef']>
>;
type Contract_0_ColumnDefBase = Assert<
	Equal<Actual0.ColumnDefBase<Features, Person>, ExpectedContracts['0_ColumnDefBase']>
>;
type Contract_0_ColumnDefBase_All = Assert<
	Equal<Actual0.ColumnDefBase_All<Features, Person>, ExpectedContracts['0_ColumnDefBase_All']>
>;
type Contract_0_ColumnDefResolved = Assert<
	Equal<Actual0.ColumnDefResolved<Features, Person>, ExpectedContracts['0_ColumnDefResolved']>
>;
type Contract_0_ColumnDefTemplate = Assert<
	Equal<Actual0.ColumnDefTemplate<{ value: string }>, ExpectedContracts['0_ColumnDefTemplate']>
>;
type Contract_0_ColumnDef_CellSelection = Assert<
	Equal<Actual0.ColumnDef_CellSelection, ExpectedContracts['0_ColumnDef_CellSelection']>
>;
type Contract_0_ColumnDef_CellSpanning = Assert<
	Equal<
		Actual0.ColumnDef_CellSpanning<Features, Person>,
		ExpectedContracts['0_ColumnDef_CellSpanning']
	>
>;
type Contract_0_ColumnDef_ColumnFiltering = Assert<
	Equal<
		Actual0.ColumnDef_ColumnFiltering<Features, Person>,
		ExpectedContracts['0_ColumnDef_ColumnFiltering']
	>
>;
type Contract_0_ColumnDef_ColumnGrouping = Assert<
	Equal<
		Actual0.ColumnDef_ColumnGrouping<Features, Person>,
		ExpectedContracts['0_ColumnDef_ColumnGrouping']
	>
>;
type Contract_0_ColumnDef_ColumnPinning = Assert<
	Equal<Actual0.ColumnDef_ColumnPinning, ExpectedContracts['0_ColumnDef_ColumnPinning']>
>;
type Contract_0_ColumnDef_ColumnResizing = Assert<
	Equal<Actual0.ColumnDef_ColumnResizing, ExpectedContracts['0_ColumnDef_ColumnResizing']>
>;
type Contract_0_ColumnDef_ColumnSizing = Assert<
	Equal<Actual0.ColumnDef_ColumnSizing, ExpectedContracts['0_ColumnDef_ColumnSizing']>
>;
type Contract_0_ColumnDef_ColumnVisibility = Assert<
	Equal<Actual0.ColumnDef_ColumnVisibility, ExpectedContracts['0_ColumnDef_ColumnVisibility']>
>;
type Contract_0_ColumnDef_FeatureMap = Assert<
	Equal<
		Actual0.ColumnDef_FeatureMap<Features, Person, string>,
		ExpectedContracts['0_ColumnDef_FeatureMap']
	>
>;
type Contract_0_ColumnDef_GlobalFiltering = Assert<
	Equal<Actual0.ColumnDef_GlobalFiltering, ExpectedContracts['0_ColumnDef_GlobalFiltering']>
>;
type Contract_0_ColumnDef_RowAggregation = Assert<
	Equal<
		Actual0.ColumnDef_RowAggregation<Features, Person>,
		ExpectedContracts['0_ColumnDef_RowAggregation']
	>
>;
type Contract_0_ColumnDef_RowSorting = Assert<
	Equal<Actual0.ColumnDef_RowSorting<Features, Person>, ExpectedContracts['0_ColumnDef_RowSorting']>
>;
type Contract_0_ColumnDefaultOptions = Assert<
	Equal<Actual0.ColumnDefaultOptions, ExpectedContracts['0_ColumnDefaultOptions']>
>;
type Contract_0_ColumnFilter = Assert<
	Equal<Actual0.ColumnFilter, ExpectedContracts['0_ColumnFilter']>
>;
type Contract_0_ColumnFilterAutoRemoveTestFn = Assert<
	Equal<
		Actual0.ColumnFilterAutoRemoveTestFn<Features, Person>,
		ExpectedContracts['0_ColumnFilterAutoRemoveTestFn']
	>
>;
type Contract_0_ColumnFiltersState = Assert<
	Equal<Actual0.ColumnFiltersState, ExpectedContracts['0_ColumnFiltersState']>
>;
type Contract_0_ColumnHelper = Assert<
	Equal<Actual0.ColumnHelper<Features, Person>, ExpectedContracts['0_ColumnHelper']>
>;
type Contract_0_ColumnIndexes = Assert<
	Equal<Actual0.ColumnIndexes, ExpectedContracts['0_ColumnIndexes']>
>;
type Contract_0_ColumnMeta = Assert<
	Equal<Actual0.ColumnMeta<Features, Person>, ExpectedContracts['0_ColumnMeta']>
>;
type Contract_0_ColumnOffsets = Assert<
	Equal<Actual0.ColumnOffsets, ExpectedContracts['0_ColumnOffsets']>
>;
type Contract_0_ColumnOffsetsByPosition = Assert<
	Equal<Actual0.ColumnOffsetsByPosition, ExpectedContracts['0_ColumnOffsetsByPosition']>
>;
type Contract_0_ColumnOrderDefaultOptions = Assert<
	Equal<Actual0.ColumnOrderDefaultOptions, ExpectedContracts['0_ColumnOrderDefaultOptions']>
>;
type Contract_0_ColumnOrderState = Assert<
	Equal<Actual0.ColumnOrderState, ExpectedContracts['0_ColumnOrderState']>
>;
type Contract_0_ColumnPinningDefaultOptions = Assert<
	Equal<Actual0.ColumnPinningDefaultOptions, ExpectedContracts['0_ColumnPinningDefaultOptions']>
>;
type Contract_0_ColumnPinningPosition = Assert<
	Equal<Actual0.ColumnPinningPosition, ExpectedContracts['0_ColumnPinningPosition']>
>;
type Contract_0_ColumnPinningState = Assert<
	Equal<Actual0.ColumnPinningState, ExpectedContracts['0_ColumnPinningState']>
>;
type Contract_0_ColumnResizeDirection = Assert<
	Equal<Actual0.ColumnResizeDirection, ExpectedContracts['0_ColumnResizeDirection']>
>;
type Contract_0_ColumnResizeMode = Assert<
	Equal<Actual0.ColumnResizeMode, ExpectedContracts['0_ColumnResizeMode']>
>;
type Contract_0_ColumnResizingDefaultOptions = Assert<
	Equal<Actual0.ColumnResizingDefaultOptions, ExpectedContracts['0_ColumnResizingDefaultOptions']>
>;
type Contract_0_ColumnSizingDefaultOptions = Assert<
	Equal<Actual0.ColumnSizingDefaultOptions, ExpectedContracts['0_ColumnSizingDefaultOptions']>
>;
type Contract_0_ColumnSizingState = Assert<
	Equal<Actual0.ColumnSizingState, ExpectedContracts['0_ColumnSizingState']>
>;
type Contract_0_ColumnSort = Assert<Equal<Actual0.ColumnSort, ExpectedContracts['0_ColumnSort']>>;
type Contract_0_ColumnVisibilityState = Assert<
	Equal<Actual0.ColumnVisibilityState, ExpectedContracts['0_ColumnVisibilityState']>
>;
type Contract_0_Column_Column = Assert<
	Equal<Actual0.Column_Column<Features, Person>, ExpectedContracts['0_Column_Column']>
>;
type Contract_0_Column_ColumnFaceting = Assert<
	Equal<
		Actual0.Column_ColumnFaceting<Features, Person>,
		ExpectedContracts['0_Column_ColumnFaceting']
	>
>;
type Contract_0_Column_ColumnFiltering = Assert<
	Equal<
		Actual0.Column_ColumnFiltering<Features, Person>,
		ExpectedContracts['0_Column_ColumnFiltering']
	>
>;
type Contract_0_Column_ColumnGrouping = Assert<
	Equal<Actual0.Column_ColumnGrouping, ExpectedContracts['0_Column_ColumnGrouping']>
>;
type Contract_0_Column_ColumnOrdering = Assert<
	Equal<Actual0.Column_ColumnOrdering, ExpectedContracts['0_Column_ColumnOrdering']>
>;
type Contract_0_Column_ColumnPinning = Assert<
	Equal<Actual0.Column_ColumnPinning, ExpectedContracts['0_Column_ColumnPinning']>
>;
type Contract_0_Column_ColumnResizing = Assert<
	Equal<Actual0.Column_ColumnResizing, ExpectedContracts['0_Column_ColumnResizing']>
>;
type Contract_0_Column_ColumnSizing = Assert<
	Equal<Actual0.Column_ColumnSizing, ExpectedContracts['0_Column_ColumnSizing']>
>;
type Contract_0_Column_ColumnVisibility = Assert<
	Equal<Actual0.Column_ColumnVisibility, ExpectedContracts['0_Column_ColumnVisibility']>
>;
type Contract_0_Column_Core = Assert<
	Equal<Actual0.Column_Core<Features, Person>, ExpectedContracts['0_Column_Core']>
>;
type Contract_0_Column_CoreProperties = Assert<
	Equal<
		Actual0.Column_CoreProperties<Features, Person>,
		ExpectedContracts['0_Column_CoreProperties']
	>
>;
type Contract_0_Column_FeatureMap = Assert<
	Equal<Actual0.Column_FeatureMap<Features, Person>, ExpectedContracts['0_Column_FeatureMap']>
>;
type Contract_0_Column_GlobalFiltering = Assert<
	Equal<Actual0.Column_GlobalFiltering, ExpectedContracts['0_Column_GlobalFiltering']>
>;
type Contract_0_Column_RowAggregation = Assert<
	Equal<
		Actual0.Column_RowAggregation<Features, Person>,
		ExpectedContracts['0_Column_RowAggregation']
	>
>;
type Contract_0_Column_RowSorting = Assert<
	Equal<Actual0.Column_RowSorting<Features, Person>, ExpectedContracts['0_Column_RowSorting']>
>;
type Contract_0_CoreFeatures = Assert<
	Equal<Actual0.CoreFeatures, ExpectedContracts['0_CoreFeatures']>
>;
type Contract_0_CreatedFilterFn = Assert<
	Equal<Actual0.CreatedFilterFn<Features, Person>, ExpectedContracts['0_CreatedFilterFn']>
>;
type Contract_0_CreatedSortFn = Assert<
	Equal<Actual0.CreatedSortFn<Features, Person>, ExpectedContracts['0_CreatedSortFn']>
>;
type Contract_0_CustomAggregationFns = Assert<
	Equal<Actual0.CustomAggregationFns<Features, Person>, ExpectedContracts['0_CustomAggregationFns']>
>;
type Contract_0_CustomFilterFns = Assert<
	Equal<Actual0.CustomFilterFns<Features, Person>, ExpectedContracts['0_CustomFilterFns']>
>;
type Contract_0_CustomSortFns = Assert<
	Equal<Actual0.CustomSortFns<Features, Person>, ExpectedContracts['0_CustomSortFns']>
>;
type Contract_0_DebugOptions = Assert<
	Equal<Actual0.DebugOptions<Features>, ExpectedContracts['0_DebugOptions']>
>;
type Contract_0_DeepKeys = Assert<
	Equal<Actual0.DeepKeys<{ sample: string }>, ExpectedContracts['0_DeepKeys']>
>;
type Contract_0_DeepValue = Assert<
	Equal<Actual0.DeepValue<{ sample: string }, 'sample'>, ExpectedContracts['0_DeepValue']>
>;
type Contract_0_DisplayColumnDef = Assert<
	Equal<Actual0.DisplayColumnDef<Features, Person>, ExpectedContracts['0_DisplayColumnDef']>
>;
type Contract_0_ExpandedState = Assert<
	Equal<Actual0.ExpandedState, ExpectedContracts['0_ExpandedState']>
>;
type Contract_0_ExpandedStateList = Assert<
	Equal<Actual0.ExpandedStateList, ExpectedContracts['0_ExpandedStateList']>
>;
type Contract_0_ExternalAtoms = Assert<
	Equal<Actual0.ExternalAtoms<Features>, ExpectedContracts['0_ExternalAtoms']>
>;
type Contract_0_ExternalAtoms_All = Assert<
	Equal<Actual0.ExternalAtoms_All, ExpectedContracts['0_ExternalAtoms_All']>
>;
type Contract_0_ExtractAggregationFnKeys = Assert<
	Equal<Actual0.ExtractAggregationFnKeys<Features>, ExpectedContracts['0_ExtractAggregationFnKeys']>
>;
type Contract_0_ExtractColumnMeta = Assert<
	Equal<Actual0.ExtractColumnMeta<Features, Person>, ExpectedContracts['0_ExtractColumnMeta']>
>;
type Contract_0_ExtractFeatureMapTypes = Assert<
	Equal<
		Actual0.ExtractFeatureMapTypes<Features, { sample: string }>,
		ExpectedContracts['0_ExtractFeatureMapTypes']
	>
>;
type Contract_0_ExtractFilterFnKeys = Assert<
	Equal<Actual0.ExtractFilterFnKeys<Features>, ExpectedContracts['0_ExtractFilterFnKeys']>
>;
type Contract_0_ExtractFilterMeta = Assert<
	Equal<Actual0.ExtractFilterMeta<Features>, ExpectedContracts['0_ExtractFilterMeta']>
>;
type Contract_0_ExtractSortFnKeys = Assert<
	Equal<Actual0.ExtractSortFnKeys<Features>, ExpectedContracts['0_ExtractSortFnKeys']>
>;
type Contract_0_ExtractTableMeta = Assert<
	Equal<Actual0.ExtractTableMeta<Features, Person>, ExpectedContracts['0_ExtractTableMeta']>
>;
type Contract_0_FeatureSlotPrereqs = Assert<
	Equal<Actual0.FeatureSlotPrereqs, ExpectedContracts['0_FeatureSlotPrereqs']>
>;
type Contract_0_FilterFn = Assert<
	Equal<Actual0.FilterFn<Features, Person>, ExpectedContracts['0_FilterFn']>
>;
type Contract_0_FilterFnDef = Assert<
	Equal<Actual0.FilterFnDef<Features, Person>, ExpectedContracts['0_FilterFnDef']>
>;
type Contract_0_FilterFnOption = Assert<
	Equal<Actual0.FilterFnOption<Features, Person>, ExpectedContracts['0_FilterFnOption']>
>;
type Contract_0_FilterFns = Assert<Equal<Actual0.FilterFns, ExpectedContracts['0_FilterFns']>>;
type Contract_0_FilterMeta = Assert<Equal<Actual0.FilterMeta, ExpectedContracts['0_FilterMeta']>>;
type Contract_0_Getter = Assert<Equal<Actual0.Getter<string>, ExpectedContracts['0_Getter']>>;
type Contract_0_GroupColumnDef = Assert<
	Equal<Actual0.GroupColumnDef<Features, Person>, ExpectedContracts['0_GroupColumnDef']>
>;
type Contract_0_GroupingColumnMode = Assert<
	Equal<Actual0.GroupingColumnMode, ExpectedContracts['0_GroupingColumnMode']>
>;
type Contract_0_GroupingState = Assert<
	Equal<Actual0.GroupingState, ExpectedContracts['0_GroupingState']>
>;
type Contract_0_Header = Assert<
	Equal<Actual0.Header<Features, Person>, ExpectedContracts['0_Header']>
>;
type Contract_0_HeaderContext = Assert<
	Equal<Actual0.HeaderContext<Features, Person>, ExpectedContracts['0_HeaderContext']>
>;
type Contract_0_HeaderGroup = Assert<
	Equal<Actual0.HeaderGroup<Features, Person>, ExpectedContracts['0_HeaderGroup']>
>;
type Contract_0_HeaderGroup_Core = Assert<
	Equal<Actual0.HeaderGroup_Core<Features, Person>, ExpectedContracts['0_HeaderGroup_Core']>
>;
type Contract_0_HeaderGroup_Header = Assert<
	Equal<Actual0.HeaderGroup_Header<Features, Person>, ExpectedContracts['0_HeaderGroup_Header']>
>;
type Contract_0_Header_ColumnResizing = Assert<
	Equal<Actual0.Header_ColumnResizing, ExpectedContracts['0_Header_ColumnResizing']>
>;
type Contract_0_Header_ColumnSizing = Assert<
	Equal<Actual0.Header_ColumnSizing, ExpectedContracts['0_Header_ColumnSizing']>
>;
type Contract_0_Header_Core = Assert<
	Equal<Actual0.Header_Core<Features, Person>, ExpectedContracts['0_Header_Core']>
>;
type Contract_0_Header_CoreProperties = Assert<
	Equal<
		Actual0.Header_CoreProperties<Features, Person>,
		ExpectedContracts['0_Header_CoreProperties']
	>
>;
type Contract_0_Header_FeatureMap = Assert<
	Equal<Actual0.Header_FeatureMap, ExpectedContracts['0_Header_FeatureMap']>
>;
type Contract_0_Header_Header = Assert<
	Equal<Actual0.Header_Header<Features, Person>, ExpectedContracts['0_Header_Header']>
>;
type Contract_0_IdIdentifier = Assert<
	Equal<Actual0.IdIdentifier<Features, Person>, ExpectedContracts['0_IdIdentifier']>
>;
type Contract_0_IdentifiedColumnDef = Assert<
	Equal<Actual0.IdentifiedColumnDef<Features, Person>, ExpectedContracts['0_IdentifiedColumnDef']>
>;
type Contract_0_IsAny = Assert<
	Equal<Actual0.IsAny<{ sample: string }>, ExpectedContracts['0_IsAny']>
>;
type Contract_0_NoInfer = Assert<
	Equal<Actual0.NoInfer<{ sample: string }>, ExpectedContracts['0_NoInfer']>
>;
type Contract_0_NonFeatureKeys = Assert<
	Equal<Actual0.NonFeatureKeys, ExpectedContracts['0_NonFeatureKeys']>
>;
type Contract_0_OnChangeFn = Assert<
	Equal<Actual0.OnChangeFn<{ sample: string }>, ExpectedContracts['0_OnChangeFn']>
>;
type Contract_0_PaginationDefaultOptions = Assert<
	Equal<Actual0.PaginationDefaultOptions, ExpectedContracts['0_PaginationDefaultOptions']>
>;
type Contract_0_PaginationState = Assert<
	Equal<Actual0.PaginationState, ExpectedContracts['0_PaginationState']>
>;
type Contract_0_PartialKeys = Assert<
	Equal<Actual0.PartialKeys<{ sample: string }, 'sample'>, ExpectedContracts['0_PartialKeys']>
>;
type Contract_0_Plugins = Assert<Equal<Actual0.Plugins, ExpectedContracts['0_Plugins']>>;
type Contract_0_Prettify = Assert<
	Equal<Actual0.Prettify<{ sample: string }>, ExpectedContracts['0_Prettify']>
>;
type Contract_0_PrototypeAPI = Assert<
	Equal<
		Actual0.PrototypeAPI<[string, number], { sample: string }>,
		ExpectedContracts['0_PrototypeAPI']
	>
>;
type Contract_0_PrototypeAPIObject = Assert<
	Equal<
		Actual0.PrototypeAPIObject<[string, number], { sample: string }>,
		ExpectedContracts['0_PrototypeAPIObject']
	>
>;
type Contract_0_RequiredKeys = Assert<
	Equal<Actual0.RequiredKeys<{ sample: string }, 'sample'>, ExpectedContracts['0_RequiredKeys']>
>;
type Contract_0_ResolvedAggregationFn = Assert<
	Equal<
		Actual0.ResolvedAggregationFn<Features, Person>,
		ExpectedContracts['0_ResolvedAggregationFn']
	>
>;
type Contract_0_ResolvedColumnFilter = Assert<
	Equal<Actual0.ResolvedColumnFilter<Features, Person>, ExpectedContracts['0_ResolvedColumnFilter']>
>;
type Contract_0_Row = Assert<Equal<Actual0.Row<Features, Person>, ExpectedContracts['0_Row']>>;
type Contract_0_RowData = Assert<Equal<Actual0.RowData, ExpectedContracts['0_RowData']>>;
type Contract_0_RowModel = Assert<
	Equal<Actual0.RowModel<Features, Person>, ExpectedContracts['0_RowModel']>
>;
type Contract_0_RowModelFns = Assert<
	Equal<Actual0.RowModelFns<Features, Person>, ExpectedContracts['0_RowModelFns']>
>;
type Contract_0_RowModelFns_All = Assert<
	Equal<Actual0.RowModelFns_All<Features, Person>, ExpectedContracts['0_RowModelFns_All']>
>;
type Contract_0_RowModelFns_ColumnFiltering = Assert<
	Equal<
		Actual0.RowModelFns_ColumnFiltering<Features, Person>,
		ExpectedContracts['0_RowModelFns_ColumnFiltering']
	>
>;
type Contract_0_RowModelFns_Core = Assert<
	Equal<Actual0.RowModelFns_Core, ExpectedContracts['0_RowModelFns_Core']>
>;
type Contract_0_RowModelFns_FeatureMap = Assert<
	Equal<
		Actual0.RowModelFns_FeatureMap<Features, Person>,
		ExpectedContracts['0_RowModelFns_FeatureMap']
	>
>;
type Contract_0_RowModelFns_RowAggregation = Assert<
	Equal<
		Actual0.RowModelFns_RowAggregation<Features, Person>,
		ExpectedContracts['0_RowModelFns_RowAggregation']
	>
>;
type Contract_0_RowModelFns_RowSorting = Assert<
	Equal<
		Actual0.RowModelFns_RowSorting<Features, Person>,
		ExpectedContracts['0_RowModelFns_RowSorting']
	>
>;
type Contract_0_RowPinningDefaultOptions = Assert<
	Equal<Actual0.RowPinningDefaultOptions, ExpectedContracts['0_RowPinningDefaultOptions']>
>;
type Contract_0_RowPinningPosition = Assert<
	Equal<Actual0.RowPinningPosition, ExpectedContracts['0_RowPinningPosition']>
>;
type Contract_0_RowPinningState = Assert<
	Equal<Actual0.RowPinningState, ExpectedContracts['0_RowPinningState']>
>;
type Contract_0_RowSelectionState = Assert<
	Equal<Actual0.RowSelectionState, ExpectedContracts['0_RowSelectionState']>
>;
type Contract_0_RowSpanContext = Assert<
	Equal<Actual0.RowSpanContext<Features, Person>, ExpectedContracts['0_RowSpanContext']>
>;
type Contract_0_Row_ColumnFiltering = Assert<
	Equal<Actual0.Row_ColumnFiltering<Features, Person>, ExpectedContracts['0_Row_ColumnFiltering']>
>;
type Contract_0_Row_ColumnGrouping = Assert<
	Equal<Actual0.Row_ColumnGrouping, ExpectedContracts['0_Row_ColumnGrouping']>
>;
type Contract_0_Row_ColumnPinning = Assert<
	Equal<Actual0.Row_ColumnPinning<Features, Person>, ExpectedContracts['0_Row_ColumnPinning']>
>;
type Contract_0_Row_ColumnVisibility = Assert<
	Equal<Actual0.Row_ColumnVisibility<Features, Person>, ExpectedContracts['0_Row_ColumnVisibility']>
>;
type Contract_0_Row_Core = Assert<
	Equal<Actual0.Row_Core<Features, Person>, ExpectedContracts['0_Row_Core']>
>;
type Contract_0_Row_CoreProperties = Assert<
	Equal<Actual0.Row_CoreProperties<Features, Person>, ExpectedContracts['0_Row_CoreProperties']>
>;
type Contract_0_Row_FeatureMap = Assert<
	Equal<Actual0.Row_FeatureMap<Features, Person>, ExpectedContracts['0_Row_FeatureMap']>
>;
type Contract_0_Row_Row = Assert<
	Equal<Actual0.Row_Row<Features, Person>, ExpectedContracts['0_Row_Row']>
>;
type Contract_0_Row_RowAggregation = Assert<
	Equal<Actual0.Row_RowAggregation, ExpectedContracts['0_Row_RowAggregation']>
>;
type Contract_0_Row_RowExpanding = Assert<
	Equal<Actual0.Row_RowExpanding, ExpectedContracts['0_Row_RowExpanding']>
>;
type Contract_0_Row_RowPinning = Assert<
	Equal<Actual0.Row_RowPinning, ExpectedContracts['0_Row_RowPinning']>
>;
type Contract_0_Row_RowSelection = Assert<
	Equal<Actual0.Row_RowSelection, ExpectedContracts['0_Row_RowSelection']>
>;
type Contract_0_SelectCellRangeOptions = Assert<
	Equal<Actual0.SelectCellRangeOptions, ExpectedContracts['0_SelectCellRangeOptions']>
>;
type Contract_0_SortDirection = Assert<
	Equal<Actual0.SortDirection, ExpectedContracts['0_SortDirection']>
>;
type Contract_0_SortFn = Assert<
	Equal<Actual0.SortFn<Features, Person>, ExpectedContracts['0_SortFn']>
>;
type Contract_0_SortFnDef = Assert<
	Equal<Actual0.SortFnDef<Features, Person>, ExpectedContracts['0_SortFnDef']>
>;
type Contract_0_SortFnOption = Assert<
	Equal<Actual0.SortFnOption<Features, Person>, ExpectedContracts['0_SortFnOption']>
>;
type Contract_0_SortFns = Assert<Equal<Actual0.SortFns, ExpectedContracts['0_SortFns']>>;
type Contract_0_SortingState = Assert<
	Equal<Actual0.SortingState, ExpectedContracts['0_SortingState']>
>;
type Contract_0_StateSliceEqualityFn = Assert<
	Equal<
		Actual0.StateSliceEqualityFn<{ sample: string }>,
		ExpectedContracts['0_StateSliceEqualityFn']
	>
>;
type Contract_0_StockFeatures = Assert<
	Equal<Actual0.StockFeatures, ExpectedContracts['0_StockFeatures']>
>;
type Contract_0_StringHeaderIdentifier = Assert<
	Equal<Actual0.StringHeaderIdentifier, ExpectedContracts['0_StringHeaderIdentifier']>
>;
type Contract_0_StringOrTemplateHeader = Assert<
	Equal<
		Actual0.StringOrTemplateHeader<Features, Person>,
		ExpectedContracts['0_StringOrTemplateHeader']
	>
>;
type Contract_0_Table = Assert<
	Equal<Actual0.Table<Features, Person>, ExpectedContracts['0_Table']>
>;
type Contract_0_TableFeature = Assert<
	Equal<Actual0.TableFeature, ExpectedContracts['0_TableFeature']>
>;
type Contract_0_TableFeatures = Assert<
	Equal<Actual0.TableFeatures, ExpectedContracts['0_TableFeatures']>
>;
type Contract_0_TableMeta = Assert<
	Equal<Actual0.TableMeta<Features, Person>, ExpectedContracts['0_TableMeta']>
>;
type Contract_0_TableOptions = Assert<
	Equal<Actual0.TableOptions<Features, Person>, ExpectedContracts['0_TableOptions']>
>;
type Contract_0_TableOptions_All = Assert<
	Equal<Actual0.TableOptions_All<Features, Person>, ExpectedContracts['0_TableOptions_All']>
>;
type Contract_0_TableOptions_Cell = Assert<
	Equal<Actual0.TableOptions_Cell, ExpectedContracts['0_TableOptions_Cell']>
>;
type Contract_0_TableOptions_CellSelection = Assert<
	Equal<
		Actual0.TableOptions_CellSelection<Features, Person>,
		ExpectedContracts['0_TableOptions_CellSelection']
	>
>;
type Contract_0_TableOptions_CellSpanning = Assert<
	Equal<Actual0.TableOptions_CellSpanning, ExpectedContracts['0_TableOptions_CellSpanning']>
>;
type Contract_0_TableOptions_ColumnFiltering = Assert<
	Equal<
		Actual0.TableOptions_ColumnFiltering<Features, Person>,
		ExpectedContracts['0_TableOptions_ColumnFiltering']
	>
>;
type Contract_0_TableOptions_ColumnGrouping = Assert<
	Equal<Actual0.TableOptions_ColumnGrouping, ExpectedContracts['0_TableOptions_ColumnGrouping']>
>;
type Contract_0_TableOptions_ColumnOrdering = Assert<
	Equal<Actual0.TableOptions_ColumnOrdering, ExpectedContracts['0_TableOptions_ColumnOrdering']>
>;
type Contract_0_TableOptions_ColumnPinning = Assert<
	Equal<Actual0.TableOptions_ColumnPinning, ExpectedContracts['0_TableOptions_ColumnPinning']>
>;
type Contract_0_TableOptions_ColumnResizing = Assert<
	Equal<Actual0.TableOptions_ColumnResizing, ExpectedContracts['0_TableOptions_ColumnResizing']>
>;
type Contract_0_TableOptions_ColumnSizing = Assert<
	Equal<Actual0.TableOptions_ColumnSizing, ExpectedContracts['0_TableOptions_ColumnSizing']>
>;
type Contract_0_TableOptions_ColumnVisibility = Assert<
	Equal<Actual0.TableOptions_ColumnVisibility, ExpectedContracts['0_TableOptions_ColumnVisibility']>
>;
type Contract_0_TableOptions_Columns = Assert<
	Equal<Actual0.TableOptions_Columns<Features, Person>, ExpectedContracts['0_TableOptions_Columns']>
>;
type Contract_0_TableOptions_Core = Assert<
	Equal<Actual0.TableOptions_Core<Features, Person>, ExpectedContracts['0_TableOptions_Core']>
>;
type Contract_0_TableOptions_FeatureMap = Assert<
	Equal<
		Actual0.TableOptions_FeatureMap<Features, Person>,
		ExpectedContracts['0_TableOptions_FeatureMap']
	>
>;
type Contract_0_TableOptions_GlobalFiltering = Assert<
	Equal<
		Actual0.TableOptions_GlobalFiltering<Features, Person>,
		ExpectedContracts['0_TableOptions_GlobalFiltering']
	>
>;
type Contract_0_TableOptions_RowAggregation = Assert<
	Equal<Actual0.TableOptions_RowAggregation, ExpectedContracts['0_TableOptions_RowAggregation']>
>;
type Contract_0_TableOptions_RowExpanding = Assert<
	Equal<
		Actual0.TableOptions_RowExpanding<Features, Person>,
		ExpectedContracts['0_TableOptions_RowExpanding']
	>
>;
type Contract_0_TableOptions_RowPagination = Assert<
	Equal<Actual0.TableOptions_RowPagination, ExpectedContracts['0_TableOptions_RowPagination']>
>;
type Contract_0_TableOptions_RowPinning = Assert<
	Equal<
		Actual0.TableOptions_RowPinning<Features, Person>,
		ExpectedContracts['0_TableOptions_RowPinning']
	>
>;
type Contract_0_TableOptions_RowSelection = Assert<
	Equal<
		Actual0.TableOptions_RowSelection<Features, Person>,
		ExpectedContracts['0_TableOptions_RowSelection']
	>
>;
type Contract_0_TableOptions_RowSorting = Assert<
	Equal<Actual0.TableOptions_RowSorting, ExpectedContracts['0_TableOptions_RowSorting']>
>;
type Contract_0_TableOptions_Rows = Assert<
	Equal<Actual0.TableOptions_Rows<Features, Person>, ExpectedContracts['0_TableOptions_Rows']>
>;
type Contract_0_TableOptions_Table = Assert<
	Equal<Actual0.TableOptions_Table<Features, Person>, ExpectedContracts['0_TableOptions_Table']>
>;
type Contract_0_TableState = Assert<
	Equal<Actual0.TableState<Features>, ExpectedContracts['0_TableState']>
>;
type Contract_0_TableState_All = Assert<
	Equal<Actual0.TableState_All, ExpectedContracts['0_TableState_All']>
>;
type Contract_0_TableState_CellSelection = Assert<
	Equal<Actual0.TableState_CellSelection, ExpectedContracts['0_TableState_CellSelection']>
>;
type Contract_0_TableState_ColumnFiltering = Assert<
	Equal<Actual0.TableState_ColumnFiltering, ExpectedContracts['0_TableState_ColumnFiltering']>
>;
type Contract_0_TableState_ColumnGrouping = Assert<
	Equal<Actual0.TableState_ColumnGrouping, ExpectedContracts['0_TableState_ColumnGrouping']>
>;
type Contract_0_TableState_ColumnOrdering = Assert<
	Equal<Actual0.TableState_ColumnOrdering, ExpectedContracts['0_TableState_ColumnOrdering']>
>;
type Contract_0_TableState_ColumnPinning = Assert<
	Equal<Actual0.TableState_ColumnPinning, ExpectedContracts['0_TableState_ColumnPinning']>
>;
type Contract_0_TableState_ColumnResizing = Assert<
	Equal<Actual0.TableState_ColumnResizing, ExpectedContracts['0_TableState_ColumnResizing']>
>;
type Contract_0_TableState_ColumnSizing = Assert<
	Equal<Actual0.TableState_ColumnSizing, ExpectedContracts['0_TableState_ColumnSizing']>
>;
type Contract_0_TableState_ColumnVisibility = Assert<
	Equal<Actual0.TableState_ColumnVisibility, ExpectedContracts['0_TableState_ColumnVisibility']>
>;
type Contract_0_TableState_FeatureMap = Assert<
	Equal<Actual0.TableState_FeatureMap, ExpectedContracts['0_TableState_FeatureMap']>
>;
type Contract_0_TableState_GlobalFiltering = Assert<
	Equal<Actual0.TableState_GlobalFiltering, ExpectedContracts['0_TableState_GlobalFiltering']>
>;
type Contract_0_TableState_RowExpanding = Assert<
	Equal<Actual0.TableState_RowExpanding, ExpectedContracts['0_TableState_RowExpanding']>
>;
type Contract_0_TableState_RowPagination = Assert<
	Equal<Actual0.TableState_RowPagination, ExpectedContracts['0_TableState_RowPagination']>
>;
type Contract_0_TableState_RowPinning = Assert<
	Equal<Actual0.TableState_RowPinning, ExpectedContracts['0_TableState_RowPinning']>
>;
type Contract_0_TableState_RowSelection = Assert<
	Equal<Actual0.TableState_RowSelection, ExpectedContracts['0_TableState_RowSelection']>
>;
type Contract_0_TableState_RowSorting = Assert<
	Equal<Actual0.TableState_RowSorting, ExpectedContracts['0_TableState_RowSorting']>
>;
type Contract_0_Table_CellSelection = Assert<
	Equal<Actual0.Table_CellSelection<Features, Person>, ExpectedContracts['0_Table_CellSelection']>
>;
type Contract_0_Table_CellSpanning = Assert<
	Equal<Actual0.Table_CellSpanning<Features, Person>, ExpectedContracts['0_Table_CellSpanning']>
>;
type Contract_0_Table_ColumnFaceting = Assert<
	Equal<Actual0.Table_ColumnFaceting<Features, Person>, ExpectedContracts['0_Table_ColumnFaceting']>
>;
type Contract_0_Table_ColumnFiltering = Assert<
	Equal<Actual0.Table_ColumnFiltering, ExpectedContracts['0_Table_ColumnFiltering']>
>;
type Contract_0_Table_ColumnGrouping = Assert<
	Equal<Actual0.Table_ColumnGrouping<Features, Person>, ExpectedContracts['0_Table_ColumnGrouping']>
>;
type Contract_0_Table_ColumnOrdering = Assert<
	Equal<Actual0.Table_ColumnOrdering<Features, Person>, ExpectedContracts['0_Table_ColumnOrdering']>
>;
type Contract_0_Table_ColumnPinning = Assert<
	Equal<Actual0.Table_ColumnPinning<Features, Person>, ExpectedContracts['0_Table_ColumnPinning']>
>;
type Contract_0_Table_ColumnResizing = Assert<
	Equal<Actual0.Table_ColumnResizing, ExpectedContracts['0_Table_ColumnResizing']>
>;
type Contract_0_Table_ColumnSizing = Assert<
	Equal<Actual0.Table_ColumnSizing, ExpectedContracts['0_Table_ColumnSizing']>
>;
type Contract_0_Table_ColumnVisibility = Assert<
	Equal<
		Actual0.Table_ColumnVisibility<Features, Person>,
		ExpectedContracts['0_Table_ColumnVisibility']
	>
>;
type Contract_0_Table_Columns = Assert<
	Equal<Actual0.Table_Columns<Features, Person>, ExpectedContracts['0_Table_Columns']>
>;
type Contract_0_Table_Core = Assert<
	Equal<Actual0.Table_Core<Features, Person>, ExpectedContracts['0_Table_Core']>
>;
type Contract_0_Table_CoreProperties = Assert<
	Equal<Actual0.Table_CoreProperties<Features, Person>, ExpectedContracts['0_Table_CoreProperties']>
>;
type Contract_0_Table_FeatureMap = Assert<
	Equal<Actual0.Table_FeatureMap<Features, Person>, ExpectedContracts['0_Table_FeatureMap']>
>;
type Contract_0_Table_GlobalFiltering = Assert<
	Equal<
		Actual0.Table_GlobalFiltering<Features, Person>,
		ExpectedContracts['0_Table_GlobalFiltering']
	>
>;
type Contract_0_Table_Headers = Assert<
	Equal<Actual0.Table_Headers<Features, Person>, ExpectedContracts['0_Table_Headers']>
>;
type Contract_0_Table_RowExpanding = Assert<
	Equal<Actual0.Table_RowExpanding<Features, Person>, ExpectedContracts['0_Table_RowExpanding']>
>;
type Contract_0_Table_RowModels = Assert<
	Equal<Actual0.Table_RowModels<Features, Person>, ExpectedContracts['0_Table_RowModels']>
>;
type Contract_0_Table_RowModels_Core = Assert<
	Equal<Actual0.Table_RowModels_Core<Features, Person>, ExpectedContracts['0_Table_RowModels_Core']>
>;
type Contract_0_Table_RowModels_Expanded = Assert<
	Equal<
		Actual0.Table_RowModels_Expanded<Features, Person>,
		ExpectedContracts['0_Table_RowModels_Expanded']
	>
>;
type Contract_0_Table_RowModels_Faceted = Assert<
	Equal<
		Actual0.Table_RowModels_Faceted<Features, Person>,
		ExpectedContracts['0_Table_RowModels_Faceted']
	>
>;
type Contract_0_Table_RowModels_Filtered = Assert<
	Equal<
		Actual0.Table_RowModels_Filtered<Features, Person>,
		ExpectedContracts['0_Table_RowModels_Filtered']
	>
>;
type Contract_0_Table_RowModels_Grouped = Assert<
	Equal<
		Actual0.Table_RowModels_Grouped<Features, Person>,
		ExpectedContracts['0_Table_RowModels_Grouped']
	>
>;
type Contract_0_Table_RowModels_Paginated = Assert<
	Equal<
		Actual0.Table_RowModels_Paginated<Features, Person>,
		ExpectedContracts['0_Table_RowModels_Paginated']
	>
>;
type Contract_0_Table_RowModels_Sorted = Assert<
	Equal<
		Actual0.Table_RowModels_Sorted<Features, Person>,
		ExpectedContracts['0_Table_RowModels_Sorted']
	>
>;
type Contract_0_Table_RowPagination = Assert<
	Equal<Actual0.Table_RowPagination<Features, Person>, ExpectedContracts['0_Table_RowPagination']>
>;
type Contract_0_Table_RowPinning = Assert<
	Equal<Actual0.Table_RowPinning<Features, Person>, ExpectedContracts['0_Table_RowPinning']>
>;
type Contract_0_Table_RowSelection = Assert<
	Equal<Actual0.Table_RowSelection<Features, Person>, ExpectedContracts['0_Table_RowSelection']>
>;
type Contract_0_Table_RowSorting = Assert<
	Equal<Actual0.Table_RowSorting<Features, Person>, ExpectedContracts['0_Table_RowSorting']>
>;
type Contract_0_Table_Rows = Assert<
	Equal<Actual0.Table_Rows<Features, Person>, ExpectedContracts['0_Table_Rows']>
>;
type Contract_0_Table_Table = Assert<
	Equal<Actual0.Table_Table<Features, Person>, ExpectedContracts['0_Table_Table']>
>;
type Contract_0_ToggleSelectedOptions = Assert<
	Equal<Actual0.ToggleSelectedOptions, ExpectedContracts['0_ToggleSelectedOptions']>
>;
type Contract_0_TransformDataValueFn = Assert<
	Equal<Actual0.TransformDataValueFn, ExpectedContracts['0_TransformDataValueFn']>
>;
type Contract_0_TransformFilterValueFn = Assert<
	Equal<
		Actual0.TransformFilterValueFn<Features, Person>,
		ExpectedContracts['0_TransformFilterValueFn']
	>
>;
type Contract_0_UnionToIntersection = Assert<
	Equal<Actual0.UnionToIntersection<{ sample: string }>, ExpectedContracts['0_UnionToIntersection']>
>;
type Contract_0_Updater = Assert<
	Equal<Actual0.Updater<{ sample: string }>, ExpectedContracts['0_Updater']>
>;
type Contract_0_ValidateFeatureSlots = Assert<
	Equal<Actual0.ValidateFeatureSlots<Features>, ExpectedContracts['0_ValidateFeatureSlots']>
>;
type Contract_0_VisibilityDefaultOptions = Assert<
	Equal<Actual0.VisibilityDefaultOptions, ExpectedContracts['0_VisibilityDefaultOptions']>
>;
type Contract_0_aggregationFn_count = Assert<
	Equal<typeof Actual0.aggregationFn_count, ExpectedContracts['0_aggregationFn_count']>
>;
type Contract_0_aggregationFn_extent = Assert<
	Equal<typeof Actual0.aggregationFn_extent, ExpectedContracts['0_aggregationFn_extent']>
>;
type Contract_0_aggregationFn_first = Assert<
	Equal<typeof Actual0.aggregationFn_first, ExpectedContracts['0_aggregationFn_first']>
>;
type Contract_0_aggregationFn_last = Assert<
	Equal<typeof Actual0.aggregationFn_last, ExpectedContracts['0_aggregationFn_last']>
>;
type Contract_0_aggregationFn_max = Assert<
	Equal<typeof Actual0.aggregationFn_max, ExpectedContracts['0_aggregationFn_max']>
>;
type Contract_0_aggregationFn_mean = Assert<
	Equal<typeof Actual0.aggregationFn_mean, ExpectedContracts['0_aggregationFn_mean']>
>;
type Contract_0_aggregationFn_median = Assert<
	Equal<typeof Actual0.aggregationFn_median, ExpectedContracts['0_aggregationFn_median']>
>;
type Contract_0_aggregationFn_min = Assert<
	Equal<typeof Actual0.aggregationFn_min, ExpectedContracts['0_aggregationFn_min']>
>;
type Contract_0_aggregationFn_sum = Assert<
	Equal<typeof Actual0.aggregationFn_sum, ExpectedContracts['0_aggregationFn_sum']>
>;
type Contract_0_aggregationFn_unique = Assert<
	Equal<typeof Actual0.aggregationFn_unique, ExpectedContracts['0_aggregationFn_unique']>
>;
type Contract_0_aggregationFn_uniqueCount = Assert<
	Equal<typeof Actual0.aggregationFn_uniqueCount, ExpectedContracts['0_aggregationFn_uniqueCount']>
>;
type Contract_0_aggregationFns = Assert<
	Equal<typeof Actual0.aggregationFns, ExpectedContracts['0_aggregationFns']>
>;
type Contract_0_assignPrototypeAPIs = Assert<
	Equal<typeof Actual0.assignPrototypeAPIs, ExpectedContracts['0_assignPrototypeAPIs']>
>;
type Contract_0_assignTableAPIs = Assert<
	Equal<typeof Actual0.assignTableAPIs, ExpectedContracts['0_assignTableAPIs']>
>;
type Contract_0_buildHeaderGroups = Assert<
	Equal<typeof Actual0.buildHeaderGroups, ExpectedContracts['0_buildHeaderGroups']>
>;
type Contract_0_callMemoOrStaticFn = Assert<
	Equal<typeof Actual0.callMemoOrStaticFn, ExpectedContracts['0_callMemoOrStaticFn']>
>;
type Contract_0_cellSelectionFeature = Assert<
	Equal<typeof Actual0.cellSelectionFeature, ExpectedContracts['0_cellSelectionFeature']>
>;
type Contract_0_cellSpanningFeature = Assert<
	Equal<typeof Actual0.cellSpanningFeature, ExpectedContracts['0_cellSpanningFeature']>
>;
type Contract_0_cloneState = Assert<
	Equal<typeof Actual0.cloneState, ExpectedContracts['0_cloneState']>
>;
type Contract_0_columnFacetingFeature = Assert<
	Equal<typeof Actual0.columnFacetingFeature, ExpectedContracts['0_columnFacetingFeature']>
>;
type Contract_0_columnFilteringFeature = Assert<
	Equal<typeof Actual0.columnFilteringFeature, ExpectedContracts['0_columnFilteringFeature']>
>;
type Contract_0_columnGroupingFeature = Assert<
	Equal<typeof Actual0.columnGroupingFeature, ExpectedContracts['0_columnGroupingFeature']>
>;
type Contract_0_columnOrderingFeature = Assert<
	Equal<typeof Actual0.columnOrderingFeature, ExpectedContracts['0_columnOrderingFeature']>
>;
type Contract_0_columnPinningFeature = Assert<
	Equal<typeof Actual0.columnPinningFeature, ExpectedContracts['0_columnPinningFeature']>
>;
type Contract_0_columnResizingFeature = Assert<
	Equal<typeof Actual0.columnResizingFeature, ExpectedContracts['0_columnResizingFeature']>
>;
type Contract_0_columnResizingState = Assert<
	Equal<Actual0.columnResizingState, ExpectedContracts['0_columnResizingState']>
>;
type Contract_0_columnSizingFeature = Assert<
	Equal<typeof Actual0.columnSizingFeature, ExpectedContracts['0_columnSizingFeature']>
>;
type Contract_0_columnVisibilityFeature = Assert<
	Equal<typeof Actual0.columnVisibilityFeature, ExpectedContracts['0_columnVisibilityFeature']>
>;
type Contract_0_constructAggregationFn = Assert<
	Equal<typeof Actual0.constructAggregationFn, ExpectedContracts['0_constructAggregationFn']>
>;
type Contract_0_constructCell = Assert<
	Equal<typeof Actual0.constructCell, ExpectedContracts['0_constructCell']>
>;
type Contract_0_constructColumn = Assert<
	Equal<typeof Actual0.constructColumn, ExpectedContracts['0_constructColumn']>
>;
type Contract_0_constructFilterFn = Assert<
	Equal<typeof Actual0.constructFilterFn, ExpectedContracts['0_constructFilterFn']>
>;
type Contract_0_constructHeader = Assert<
	Equal<typeof Actual0.constructHeader, ExpectedContracts['0_constructHeader']>
>;
type Contract_0_constructRow = Assert<
	Equal<typeof Actual0.constructRow, ExpectedContracts['0_constructRow']>
>;
type Contract_0_constructSortFn = Assert<
	Equal<typeof Actual0.constructSortFn, ExpectedContracts['0_constructSortFn']>
>;
type Contract_0_constructTable = Assert<
	Equal<typeof Actual0.constructTable, ExpectedContracts['0_constructTable']>
>;
type Contract_0_copyInstancePropertiesWithoutMemos = Assert<
	Equal<
		typeof Actual0.copyInstancePropertiesWithoutMemos,
		ExpectedContracts['0_copyInstancePropertiesWithoutMemos']
	>
>;
type Contract_0_coreCellsFeature = Assert<
	Equal<typeof Actual0.coreCellsFeature, ExpectedContracts['0_coreCellsFeature']>
>;
type Contract_0_coreColumnsFeature = Assert<
	Equal<typeof Actual0.coreColumnsFeature, ExpectedContracts['0_coreColumnsFeature']>
>;
type Contract_0_coreFeatures = Assert<
	Equal<typeof Actual0.coreFeatures, ExpectedContracts['0_coreFeatures']>
>;
type Contract_0_coreHeadersFeature = Assert<
	Equal<typeof Actual0.coreHeadersFeature, ExpectedContracts['0_coreHeadersFeature']>
>;
type Contract_0_coreRowModelsFeature = Assert<
	Equal<typeof Actual0.coreRowModelsFeature, ExpectedContracts['0_coreRowModelsFeature']>
>;
type Contract_0_coreRowsFeature = Assert<
	Equal<typeof Actual0.coreRowsFeature, ExpectedContracts['0_coreRowsFeature']>
>;
type Contract_0_coreTablesFeature = Assert<
	Equal<typeof Actual0.coreTablesFeature, ExpectedContracts['0_coreTablesFeature']>
>;
type Contract_0_createColumnHelper = Assert<
	Equal<typeof Actual0.createColumnHelper, ExpectedContracts['0_createColumnHelper']>
>;
type Contract_0_createCoreRowModel = Assert<
	Equal<typeof Actual0.createCoreRowModel, ExpectedContracts['0_createCoreRowModel']>
>;
type Contract_0_createExpandedRowModel = Assert<
	Equal<typeof Actual0.createExpandedRowModel, ExpectedContracts['0_createExpandedRowModel']>
>;
type Contract_0_createFacetedMinMaxValues = Assert<
	Equal<typeof Actual0.createFacetedMinMaxValues, ExpectedContracts['0_createFacetedMinMaxValues']>
>;
type Contract_0_createFacetedRowModel = Assert<
	Equal<typeof Actual0.createFacetedRowModel, ExpectedContracts['0_createFacetedRowModel']>
>;
type Contract_0_createFacetedUniqueValues = Assert<
	Equal<typeof Actual0.createFacetedUniqueValues, ExpectedContracts['0_createFacetedUniqueValues']>
>;
type Contract_0_createFilteredRowModel = Assert<
	Equal<typeof Actual0.createFilteredRowModel, ExpectedContracts['0_createFilteredRowModel']>
>;
type Contract_0_createGroupedRowModel = Assert<
	Equal<typeof Actual0.createGroupedRowModel, ExpectedContracts['0_createGroupedRowModel']>
>;
type Contract_0_createPaginatedRowModel = Assert<
	Equal<typeof Actual0.createPaginatedRowModel, ExpectedContracts['0_createPaginatedRowModel']>
>;
type Contract_0_createSortedRowModel = Assert<
	Equal<typeof Actual0.createSortedRowModel, ExpectedContracts['0_createSortedRowModel']>
>;
type Contract_0_expandRows = Assert<
	Equal<typeof Actual0.expandRows, ExpectedContracts['0_expandRows']>
>;
type Contract_0_filterFn_arrHas = Assert<
	Equal<typeof Actual0.filterFn_arrHas, ExpectedContracts['0_filterFn_arrHas']>
>;
type Contract_0_filterFn_arrIncludes = Assert<
	Equal<typeof Actual0.filterFn_arrIncludes, ExpectedContracts['0_filterFn_arrIncludes']>
>;
type Contract_0_filterFn_arrIncludesAll = Assert<
	Equal<typeof Actual0.filterFn_arrIncludesAll, ExpectedContracts['0_filterFn_arrIncludesAll']>
>;
type Contract_0_filterFn_arrIncludesSome = Assert<
	Equal<typeof Actual0.filterFn_arrIncludesSome, ExpectedContracts['0_filterFn_arrIncludesSome']>
>;
type Contract_0_filterFn_between = Assert<
	Equal<typeof Actual0.filterFn_between, ExpectedContracts['0_filterFn_between']>
>;
type Contract_0_filterFn_betweenInclusive = Assert<
	Equal<typeof Actual0.filterFn_betweenInclusive, ExpectedContracts['0_filterFn_betweenInclusive']>
>;
type Contract_0_filterFn_empty = Assert<
	Equal<typeof Actual0.filterFn_empty, ExpectedContracts['0_filterFn_empty']>
>;
type Contract_0_filterFn_endsWith = Assert<
	Equal<typeof Actual0.filterFn_endsWith, ExpectedContracts['0_filterFn_endsWith']>
>;
type Contract_0_filterFn_equals = Assert<
	Equal<typeof Actual0.filterFn_equals, ExpectedContracts['0_filterFn_equals']>
>;
type Contract_0_filterFn_equalsString = Assert<
	Equal<typeof Actual0.filterFn_equalsString, ExpectedContracts['0_filterFn_equalsString']>
>;
type Contract_0_filterFn_equalsStringSensitive = Assert<
	Equal<
		typeof Actual0.filterFn_equalsStringSensitive,
		ExpectedContracts['0_filterFn_equalsStringSensitive']
	>
>;
type Contract_0_filterFn_greaterThan = Assert<
	Equal<typeof Actual0.filterFn_greaterThan, ExpectedContracts['0_filterFn_greaterThan']>
>;
type Contract_0_filterFn_greaterThanOrEqualTo = Assert<
	Equal<
		typeof Actual0.filterFn_greaterThanOrEqualTo,
		ExpectedContracts['0_filterFn_greaterThanOrEqualTo']
	>
>;
type Contract_0_filterFn_inDateRange = Assert<
	Equal<typeof Actual0.filterFn_inDateRange, ExpectedContracts['0_filterFn_inDateRange']>
>;
type Contract_0_filterFn_inNumberRange = Assert<
	Equal<typeof Actual0.filterFn_inNumberRange, ExpectedContracts['0_filterFn_inNumberRange']>
>;
type Contract_0_filterFn_includesString = Assert<
	Equal<typeof Actual0.filterFn_includesString, ExpectedContracts['0_filterFn_includesString']>
>;
type Contract_0_filterFn_includesStringSensitive = Assert<
	Equal<
		typeof Actual0.filterFn_includesStringSensitive,
		ExpectedContracts['0_filterFn_includesStringSensitive']
	>
>;
type Contract_0_filterFn_lessThan = Assert<
	Equal<typeof Actual0.filterFn_lessThan, ExpectedContracts['0_filterFn_lessThan']>
>;
type Contract_0_filterFn_lessThanOrEqualTo = Assert<
	Equal<
		typeof Actual0.filterFn_lessThanOrEqualTo,
		ExpectedContracts['0_filterFn_lessThanOrEqualTo']
	>
>;
type Contract_0_filterFn_notEmpty = Assert<
	Equal<typeof Actual0.filterFn_notEmpty, ExpectedContracts['0_filterFn_notEmpty']>
>;
type Contract_0_filterFn_startsWith = Assert<
	Equal<typeof Actual0.filterFn_startsWith, ExpectedContracts['0_filterFn_startsWith']>
>;
type Contract_0_filterFn_weakEquals = Assert<
	Equal<typeof Actual0.filterFn_weakEquals, ExpectedContracts['0_filterFn_weakEquals']>
>;
type Contract_0_filterFns = Assert<
	Equal<typeof Actual0.filterFns, ExpectedContracts['0_filterFns']>
>;
type Contract_0_flattenBy = Assert<
	Equal<typeof Actual0.flattenBy, ExpectedContracts['0_flattenBy']>
>;
type Contract_0_functionalUpdate = Assert<
	Equal<typeof Actual0.functionalUpdate, ExpectedContracts['0_functionalUpdate']>
>;
type Contract_0_getFunctionNameInfo = Assert<
	Equal<typeof Actual0.getFunctionNameInfo, ExpectedContracts['0_getFunctionNameInfo']>
>;
type Contract_0_getInitialTableState = Assert<
	Equal<typeof Actual0.getInitialTableState, ExpectedContracts['0_getInitialTableState']>
>;
type Contract_0_globalFilteringFeature = Assert<
	Equal<typeof Actual0.globalFilteringFeature, ExpectedContracts['0_globalFilteringFeature']>
>;
type Contract_0_hasOwn = Assert<Equal<typeof Actual0.hasOwn, ExpectedContracts['0_hasOwn']>>;
type Contract_0_isFunction = Assert<
	Equal<typeof Actual0.isFunction, ExpectedContracts['0_isFunction']>
>;
type Contract_0_makeObjectMap = Assert<
	Equal<typeof Actual0.makeObjectMap, ExpectedContracts['0_makeObjectMap']>
>;
type Contract_0_makeStateUpdater = Assert<
	Equal<typeof Actual0.makeStateUpdater, ExpectedContracts['0_makeStateUpdater']>
>;
type Contract_0_memo = Assert<Equal<typeof Actual0.memo, ExpectedContracts['0_memo']>>;
type Contract_0_metaHelper = Assert<
	Equal<typeof Actual0.metaHelper, ExpectedContracts['0_metaHelper']>
>;
type Contract_0_reSplitAlphaNumeric = Assert<
	Equal<typeof Actual0.reSplitAlphaNumeric, ExpectedContracts['0_reSplitAlphaNumeric']>
>;
type Contract_0_rowAggregationFeature = Assert<
	Equal<typeof Actual0.rowAggregationFeature, ExpectedContracts['0_rowAggregationFeature']>
>;
type Contract_0_rowExpandingFeature = Assert<
	Equal<typeof Actual0.rowExpandingFeature, ExpectedContracts['0_rowExpandingFeature']>
>;
type Contract_0_rowPaginationFeature = Assert<
	Equal<typeof Actual0.rowPaginationFeature, ExpectedContracts['0_rowPaginationFeature']>
>;
type Contract_0_rowPinningFeature = Assert<
	Equal<typeof Actual0.rowPinningFeature, ExpectedContracts['0_rowPinningFeature']>
>;
type Contract_0_rowSelectionFeature = Assert<
	Equal<typeof Actual0.rowSelectionFeature, ExpectedContracts['0_rowSelectionFeature']>
>;
type Contract_0_rowSortingFeature = Assert<
	Equal<typeof Actual0.rowSortingFeature, ExpectedContracts['0_rowSortingFeature']>
>;
type Contract_0_setStateSlice = Assert<
	Equal<typeof Actual0.setStateSlice, ExpectedContracts['0_setStateSlice']>
>;
type Contract_0_skipFirstRun = Assert<
	Equal<typeof Actual0.skipFirstRun, ExpectedContracts['0_skipFirstRun']>
>;
type Contract_0_sortFn_alphanumeric = Assert<
	Equal<typeof Actual0.sortFn_alphanumeric, ExpectedContracts['0_sortFn_alphanumeric']>
>;
type Contract_0_sortFn_alphanumericCaseSensitive = Assert<
	Equal<
		typeof Actual0.sortFn_alphanumericCaseSensitive,
		ExpectedContracts['0_sortFn_alphanumericCaseSensitive']
	>
>;
type Contract_0_sortFn_basic = Assert<
	Equal<typeof Actual0.sortFn_basic, ExpectedContracts['0_sortFn_basic']>
>;
type Contract_0_sortFn_datetime = Assert<
	Equal<typeof Actual0.sortFn_datetime, ExpectedContracts['0_sortFn_datetime']>
>;
type Contract_0_sortFn_text = Assert<
	Equal<typeof Actual0.sortFn_text, ExpectedContracts['0_sortFn_text']>
>;
type Contract_0_sortFn_textCaseSensitive = Assert<
	Equal<typeof Actual0.sortFn_textCaseSensitive, ExpectedContracts['0_sortFn_textCaseSensitive']>
>;
type Contract_0_sortFns = Assert<Equal<typeof Actual0.sortFns, ExpectedContracts['0_sortFns']>>;
type Contract_0_stateSlicesEqual = Assert<
	Equal<typeof Actual0.stateSlicesEqual, ExpectedContracts['0_stateSlicesEqual']>
>;
type Contract_0_stockFeatures = Assert<
	Equal<typeof Actual0.stockFeatures, ExpectedContracts['0_stockFeatures']>
>;
type Contract_0_tableFeatures = Assert<
	Equal<typeof Actual0.tableFeatures, ExpectedContracts['0_tableFeatures']>
>;
type Contract_0_tableMemo = Assert<
	Equal<typeof Actual0.tableMemo, ExpectedContracts['0_tableMemo']>
>;
type Contract_0_tableOptions = Assert<
	Equal<typeof Actual0.tableOptions, ExpectedContracts['0_tableOptions']>
>;
type Contract_1_FlexRender = Assert<
	Equal<Parameters<typeof Actual1.FlexRender>['length'], ExpectedContracts['1_FlexRender']>
>;
type Contract_1_FlexRenderProps = Assert<
	Equal<keyof Actual1.FlexRenderProps<Features, Person>, ExpectedContracts['1_FlexRenderProps']>
>;
type Contract_1_Renderable = Assert<
	Equal<keyof Actual1.Renderable<{ value: string }>, ExpectedContracts['1_Renderable']>
>;
type Contract_1_flexRender = Assert<
	Equal<Parameters<typeof Actual1.flexRender>['length'], ExpectedContracts['1_flexRender']>
>;
type Contract_2_FacetedMinMaxValuesFactory = Assert<
	Equal<
		Parameters<Actual2.FacetedMinMaxValuesFactory<Person>>['length'],
		ExpectedContracts['2_FacetedMinMaxValuesFactory']
	>
>;
type Contract_2_FacetedRowModelFactory = Assert<
	Equal<
		Parameters<Actual2.FacetedRowModelFactory<Person>>['length'],
		ExpectedContracts['2_FacetedRowModelFactory']
	>
>;
type Contract_2_FacetedUniqueValuesFactory = Assert<
	Equal<
		Parameters<Actual2.FacetedUniqueValuesFactory<Person>>['length'],
		ExpectedContracts['2_FacetedUniqueValuesFactory']
	>
>;
type Contract_2_LegacyCell = Assert<
	Equal<keyof Actual2.LegacyCell<Person>, ExpectedContracts['2_LegacyCell']>
>;
type Contract_2_LegacyColumn = Assert<
	Equal<keyof Actual2.LegacyColumn<Person>, ExpectedContracts['2_LegacyColumn']>
>;
type Contract_2_LegacyColumnDef = Assert<
	Equal<keyof Actual2.LegacyColumnDef<Person>, ExpectedContracts['2_LegacyColumnDef']>
>;
type Contract_2_LegacyFeatures = Assert<
	Equal<keyof Actual2.LegacyFeatures, ExpectedContracts['2_LegacyFeatures']>
>;
type Contract_2_LegacyHeader = Assert<
	Equal<keyof Actual2.LegacyHeader<Person>, ExpectedContracts['2_LegacyHeader']>
>;
type Contract_2_LegacyHeaderGroup = Assert<
	Equal<keyof Actual2.LegacyHeaderGroup<Person>, ExpectedContracts['2_LegacyHeaderGroup']>
>;
type Contract_2_LegacyReactTable = Assert<
	Equal<keyof Actual2.LegacyReactTable<Person>, ExpectedContracts['2_LegacyReactTable']>
>;
type Contract_2_LegacyRow = Assert<
	Equal<keyof Actual2.LegacyRow<Person>, ExpectedContracts['2_LegacyRow']>
>;
type Contract_2_LegacyRowModelOptions = Assert<
	Equal<keyof Actual2.LegacyRowModelOptions<Person>, ExpectedContracts['2_LegacyRowModelOptions']>
>;
type Contract_2_LegacyTable = Assert<
	Equal<keyof Actual2.LegacyTable<Person>, ExpectedContracts['2_LegacyTable']>
>;
type Contract_2_LegacyTableOptions = Assert<
	Equal<keyof Actual2.LegacyTableOptions<Person>, ExpectedContracts['2_LegacyTableOptions']>
>;
type Contract_2_RowModelFactory = Assert<
	Equal<
		Parameters<Actual2.RowModelFactory<Person>>['length'],
		ExpectedContracts['2_RowModelFactory']
	>
>;
type Contract_2_getCoreRowModel = Assert<
	Equal<
		Parameters<typeof Actual2.getCoreRowModel>['length'],
		ExpectedContracts['2_getCoreRowModel']
	>
>;
type Contract_2_getExpandedRowModel = Assert<
	Equal<
		Parameters<typeof Actual2.getExpandedRowModel>['length'],
		ExpectedContracts['2_getExpandedRowModel']
	>
>;
type Contract_2_getFacetedMinMaxValues = Assert<
	Equal<
		Parameters<typeof Actual2.getFacetedMinMaxValues>['length'],
		ExpectedContracts['2_getFacetedMinMaxValues']
	>
>;
type Contract_2_getFacetedRowModel = Assert<
	Equal<
		Parameters<typeof Actual2.getFacetedRowModel>['length'],
		ExpectedContracts['2_getFacetedRowModel']
	>
>;
type Contract_2_getFacetedUniqueValues = Assert<
	Equal<
		Parameters<typeof Actual2.getFacetedUniqueValues>['length'],
		ExpectedContracts['2_getFacetedUniqueValues']
	>
>;
type Contract_2_getFilteredRowModel = Assert<
	Equal<
		Parameters<typeof Actual2.getFilteredRowModel>['length'],
		ExpectedContracts['2_getFilteredRowModel']
	>
>;
type Contract_2_getGroupedRowModel = Assert<
	Equal<
		Parameters<typeof Actual2.getGroupedRowModel>['length'],
		ExpectedContracts['2_getGroupedRowModel']
	>
>;
type Contract_2_getPaginationRowModel = Assert<
	Equal<
		Parameters<typeof Actual2.getPaginationRowModel>['length'],
		ExpectedContracts['2_getPaginationRowModel']
	>
>;
type Contract_2_getSortedRowModel = Assert<
	Equal<
		Parameters<typeof Actual2.getSortedRowModel>['length'],
		ExpectedContracts['2_getSortedRowModel']
	>
>;
type Contract_2_legacyCreateColumnHelper = Assert<
	Equal<
		Parameters<typeof Actual2.legacyCreateColumnHelper>['length'],
		ExpectedContracts['2_legacyCreateColumnHelper']
	>
>;
type Contract_2_useLegacyTable = Assert<
	Equal<Parameters<typeof Actual2.useLegacyTable>['length'], ExpectedContracts['2_useLegacyTable']>
>;
type Contract_3_aggregateColumnValue = Assert<
	Equal<typeof Actual3.aggregateColumnValue, ExpectedContracts['3_aggregateColumnValue']>
>;
type Contract_3_cell_getCanSelect = Assert<
	Equal<typeof Actual3.cell_getCanSelect, ExpectedContracts['3_cell_getCanSelect']>
>;
type Contract_3_cell_getColSpan = Assert<
	Equal<typeof Actual3.cell_getColSpan, ExpectedContracts['3_cell_getColSpan']>
>;
type Contract_3_cell_getContext = Assert<
	Equal<typeof Actual3.cell_getContext, ExpectedContracts['3_cell_getContext']>
>;
type Contract_3_cell_getIsAggregated = Assert<
	Equal<typeof Actual3.cell_getIsAggregated, ExpectedContracts['3_cell_getIsAggregated']>
>;
type Contract_3_cell_getIsCovered = Assert<
	Equal<typeof Actual3.cell_getIsCovered, ExpectedContracts['3_cell_getIsCovered']>
>;
type Contract_3_cell_getIsFocused = Assert<
	Equal<typeof Actual3.cell_getIsFocused, ExpectedContracts['3_cell_getIsFocused']>
>;
type Contract_3_cell_getIsGrouped = Assert<
	Equal<typeof Actual3.cell_getIsGrouped, ExpectedContracts['3_cell_getIsGrouped']>
>;
type Contract_3_cell_getIsPlaceholder = Assert<
	Equal<typeof Actual3.cell_getIsPlaceholder, ExpectedContracts['3_cell_getIsPlaceholder']>
>;
type Contract_3_cell_getIsSelected = Assert<
	Equal<typeof Actual3.cell_getIsSelected, ExpectedContracts['3_cell_getIsSelected']>
>;
type Contract_3_cell_getRowSpan = Assert<
	Equal<typeof Actual3.cell_getRowSpan, ExpectedContracts['3_cell_getRowSpan']>
>;
type Contract_3_cell_getSelectionEdges = Assert<
	Equal<typeof Actual3.cell_getSelectionEdges, ExpectedContracts['3_cell_getSelectionEdges']>
>;
type Contract_3_cell_getSelectionExtendHandler = Assert<
	Equal<
		typeof Actual3.cell_getSelectionExtendHandler,
		ExpectedContracts['3_cell_getSelectionExtendHandler']
	>
>;
type Contract_3_cell_getSelectionStartHandler = Assert<
	Equal<
		typeof Actual3.cell_getSelectionStartHandler,
		ExpectedContracts['3_cell_getSelectionStartHandler']
	>
>;
type Contract_3_cell_getTabIndex = Assert<
	Equal<typeof Actual3.cell_getTabIndex, ExpectedContracts['3_cell_getTabIndex']>
>;
type Contract_3_cell_getValue = Assert<
	Equal<typeof Actual3.cell_getValue, ExpectedContracts['3_cell_getValue']>
>;
type Contract_3_cell_renderValue = Assert<
	Equal<typeof Actual3.cell_renderValue, ExpectedContracts['3_cell_renderValue']>
>;
type Contract_3_column_clearSorting = Assert<
	Equal<typeof Actual3.column_clearSorting, ExpectedContracts['3_column_clearSorting']>
>;
type Contract_3_column_getAfter = Assert<
	Equal<typeof Actual3.column_getAfter, ExpectedContracts['3_column_getAfter']>
>;
type Contract_3_column_getAggregationFns = Assert<
	Equal<typeof Actual3.column_getAggregationFns, ExpectedContracts['3_column_getAggregationFns']>
>;
type Contract_3_column_getAggregationValue = Assert<
	Equal<
		typeof Actual3.column_getAggregationValue,
		ExpectedContracts['3_column_getAggregationValue']
	>
>;
type Contract_3_column_getAutoAggregationFn = Assert<
	Equal<
		typeof Actual3.column_getAutoAggregationFn,
		ExpectedContracts['3_column_getAutoAggregationFn']
	>
>;
type Contract_3_column_getAutoFilterFn = Assert<
	Equal<typeof Actual3.column_getAutoFilterFn, ExpectedContracts['3_column_getAutoFilterFn']>
>;
type Contract_3_column_getAutoSortDir = Assert<
	Equal<typeof Actual3.column_getAutoSortDir, ExpectedContracts['3_column_getAutoSortDir']>
>;
type Contract_3_column_getAutoSortFn = Assert<
	Equal<typeof Actual3.column_getAutoSortFn, ExpectedContracts['3_column_getAutoSortFn']>
>;
type Contract_3_column_getCanFilter = Assert<
	Equal<typeof Actual3.column_getCanFilter, ExpectedContracts['3_column_getCanFilter']>
>;
type Contract_3_column_getCanGlobalFilter = Assert<
	Equal<typeof Actual3.column_getCanGlobalFilter, ExpectedContracts['3_column_getCanGlobalFilter']>
>;
type Contract_3_column_getCanGroup = Assert<
	Equal<typeof Actual3.column_getCanGroup, ExpectedContracts['3_column_getCanGroup']>
>;
type Contract_3_column_getCanHide = Assert<
	Equal<typeof Actual3.column_getCanHide, ExpectedContracts['3_column_getCanHide']>
>;
type Contract_3_column_getCanMultiSort = Assert<
	Equal<typeof Actual3.column_getCanMultiSort, ExpectedContracts['3_column_getCanMultiSort']>
>;
type Contract_3_column_getCanPin = Assert<
	Equal<typeof Actual3.column_getCanPin, ExpectedContracts['3_column_getCanPin']>
>;
type Contract_3_column_getCanResize = Assert<
	Equal<typeof Actual3.column_getCanResize, ExpectedContracts['3_column_getCanResize']>
>;
type Contract_3_column_getCanSort = Assert<
	Equal<typeof Actual3.column_getCanSort, ExpectedContracts['3_column_getCanSort']>
>;
type Contract_3_column_getCanSpan = Assert<
	Equal<typeof Actual3.column_getCanSpan, ExpectedContracts['3_column_getCanSpan']>
>;
type Contract_3_column_getFacetedMinMaxValues = Assert<
	Equal<
		typeof Actual3.column_getFacetedMinMaxValues,
		ExpectedContracts['3_column_getFacetedMinMaxValues']
	>
>;
type Contract_3_column_getFacetedRowModel = Assert<
	Equal<typeof Actual3.column_getFacetedRowModel, ExpectedContracts['3_column_getFacetedRowModel']>
>;
type Contract_3_column_getFacetedUniqueValues = Assert<
	Equal<
		typeof Actual3.column_getFacetedUniqueValues,
		ExpectedContracts['3_column_getFacetedUniqueValues']
	>
>;
type Contract_3_column_getFilterFn = Assert<
	Equal<typeof Actual3.column_getFilterFn, ExpectedContracts['3_column_getFilterFn']>
>;
type Contract_3_column_getFilterIndex = Assert<
	Equal<typeof Actual3.column_getFilterIndex, ExpectedContracts['3_column_getFilterIndex']>
>;
type Contract_3_column_getFilterValue = Assert<
	Equal<typeof Actual3.column_getFilterValue, ExpectedContracts['3_column_getFilterValue']>
>;
type Contract_3_column_getFirstSortDir = Assert<
	Equal<typeof Actual3.column_getFirstSortDir, ExpectedContracts['3_column_getFirstSortDir']>
>;
type Contract_3_column_getFlatColumns = Assert<
	Equal<typeof Actual3.column_getFlatColumns, ExpectedContracts['3_column_getFlatColumns']>
>;
type Contract_3_column_getGroupedIndex = Assert<
	Equal<typeof Actual3.column_getGroupedIndex, ExpectedContracts['3_column_getGroupedIndex']>
>;
type Contract_3_column_getIndex = Assert<
	Equal<typeof Actual3.column_getIndex, ExpectedContracts['3_column_getIndex']>
>;
type Contract_3_column_getIsFiltered = Assert<
	Equal<typeof Actual3.column_getIsFiltered, ExpectedContracts['3_column_getIsFiltered']>
>;
type Contract_3_column_getIsFirstColumn = Assert<
	Equal<typeof Actual3.column_getIsFirstColumn, ExpectedContracts['3_column_getIsFirstColumn']>
>;
type Contract_3_column_getIsGrouped = Assert<
	Equal<typeof Actual3.column_getIsGrouped, ExpectedContracts['3_column_getIsGrouped']>
>;
type Contract_3_column_getIsLastColumn = Assert<
	Equal<typeof Actual3.column_getIsLastColumn, ExpectedContracts['3_column_getIsLastColumn']>
>;
type Contract_3_column_getIsPinned = Assert<
	Equal<typeof Actual3.column_getIsPinned, ExpectedContracts['3_column_getIsPinned']>
>;
type Contract_3_column_getIsResizing = Assert<
	Equal<typeof Actual3.column_getIsResizing, ExpectedContracts['3_column_getIsResizing']>
>;
type Contract_3_column_getIsSorted = Assert<
	Equal<typeof Actual3.column_getIsSorted, ExpectedContracts['3_column_getIsSorted']>
>;
type Contract_3_column_getIsVisible = Assert<
	Equal<typeof Actual3.column_getIsVisible, ExpectedContracts['3_column_getIsVisible']>
>;
type Contract_3_column_getLeafColumns = Assert<
	Equal<typeof Actual3.column_getLeafColumns, ExpectedContracts['3_column_getLeafColumns']>
>;
type Contract_3_column_getNextSortingOrder = Assert<
	Equal<
		typeof Actual3.column_getNextSortingOrder,
		ExpectedContracts['3_column_getNextSortingOrder']
	>
>;
type Contract_3_column_getPinnedIndex = Assert<
	Equal<typeof Actual3.column_getPinnedIndex, ExpectedContracts['3_column_getPinnedIndex']>
>;
type Contract_3_column_getSize = Assert<
	Equal<typeof Actual3.column_getSize, ExpectedContracts['3_column_getSize']>
>;
type Contract_3_column_getSortFn = Assert<
	Equal<typeof Actual3.column_getSortFn, ExpectedContracts['3_column_getSortFn']>
>;
type Contract_3_column_getSortIndex = Assert<
	Equal<typeof Actual3.column_getSortIndex, ExpectedContracts['3_column_getSortIndex']>
>;
type Contract_3_column_getStart = Assert<
	Equal<typeof Actual3.column_getStart, ExpectedContracts['3_column_getStart']>
>;
type Contract_3_column_getToggleGroupingHandler = Assert<
	Equal<
		typeof Actual3.column_getToggleGroupingHandler,
		ExpectedContracts['3_column_getToggleGroupingHandler']
	>
>;
type Contract_3_column_getToggleSortingHandler = Assert<
	Equal<
		typeof Actual3.column_getToggleSortingHandler,
		ExpectedContracts['3_column_getToggleSortingHandler']
	>
>;
type Contract_3_column_getToggleVisibilityHandler = Assert<
	Equal<
		typeof Actual3.column_getToggleVisibilityHandler,
		ExpectedContracts['3_column_getToggleVisibilityHandler']
	>
>;
type Contract_3_column_pin = Assert<
	Equal<typeof Actual3.column_pin, ExpectedContracts['3_column_pin']>
>;
type Contract_3_column_resetSize = Assert<
	Equal<typeof Actual3.column_resetSize, ExpectedContracts['3_column_resetSize']>
>;
type Contract_3_column_setFilterValue = Assert<
	Equal<typeof Actual3.column_setFilterValue, ExpectedContracts['3_column_setFilterValue']>
>;
type Contract_3_column_toggleGrouping = Assert<
	Equal<typeof Actual3.column_toggleGrouping, ExpectedContracts['3_column_toggleGrouping']>
>;
type Contract_3_column_toggleSorting = Assert<
	Equal<typeof Actual3.column_toggleSorting, ExpectedContracts['3_column_toggleSorting']>
>;
type Contract_3_column_toggleVisibility = Assert<
	Equal<typeof Actual3.column_toggleVisibility, ExpectedContracts['3_column_toggleVisibility']>
>;
type Contract_3_formatAggregatedCellValue = Assert<
	Equal<typeof Actual3.formatAggregatedCellValue, ExpectedContracts['3_formatAggregatedCellValue']>
>;
type Contract_3_getDefaultCellSelectionState = Assert<
	Equal<
		typeof Actual3.getDefaultCellSelectionState,
		ExpectedContracts['3_getDefaultCellSelectionState']
	>
>;
type Contract_3_getDefaultColumnFiltersState = Assert<
	Equal<
		typeof Actual3.getDefaultColumnFiltersState,
		ExpectedContracts['3_getDefaultColumnFiltersState']
	>
>;
type Contract_3_getDefaultColumnOrderState = Assert<
	Equal<
		typeof Actual3.getDefaultColumnOrderState,
		ExpectedContracts['3_getDefaultColumnOrderState']
	>
>;
type Contract_3_getDefaultColumnPinningState = Assert<
	Equal<
		typeof Actual3.getDefaultColumnPinningState,
		ExpectedContracts['3_getDefaultColumnPinningState']
	>
>;
type Contract_3_getDefaultColumnResizingState = Assert<
	Equal<
		typeof Actual3.getDefaultColumnResizingState,
		ExpectedContracts['3_getDefaultColumnResizingState']
	>
>;
type Contract_3_getDefaultColumnSizingColumnDef = Assert<
	Equal<
		typeof Actual3.getDefaultColumnSizingColumnDef,
		ExpectedContracts['3_getDefaultColumnSizingColumnDef']
	>
>;
type Contract_3_getDefaultColumnSizingState = Assert<
	Equal<
		typeof Actual3.getDefaultColumnSizingState,
		ExpectedContracts['3_getDefaultColumnSizingState']
	>
>;
type Contract_3_getDefaultColumnVisibilityState = Assert<
	Equal<
		typeof Actual3.getDefaultColumnVisibilityState,
		ExpectedContracts['3_getDefaultColumnVisibilityState']
	>
>;
type Contract_3_getDefaultExpandedState = Assert<
	Equal<typeof Actual3.getDefaultExpandedState, ExpectedContracts['3_getDefaultExpandedState']>
>;
type Contract_3_getDefaultGroupingState = Assert<
	Equal<typeof Actual3.getDefaultGroupingState, ExpectedContracts['3_getDefaultGroupingState']>
>;
type Contract_3_getDefaultPaginationState = Assert<
	Equal<typeof Actual3.getDefaultPaginationState, ExpectedContracts['3_getDefaultPaginationState']>
>;
type Contract_3_getDefaultRowPinningState = Assert<
	Equal<typeof Actual3.getDefaultRowPinningState, ExpectedContracts['3_getDefaultRowPinningState']>
>;
type Contract_3_getDefaultRowSelectionState = Assert<
	Equal<
		typeof Actual3.getDefaultRowSelectionState,
		ExpectedContracts['3_getDefaultRowSelectionState']
	>
>;
type Contract_3_getDefaultSortingState = Assert<
	Equal<typeof Actual3.getDefaultSortingState, ExpectedContracts['3_getDefaultSortingState']>
>;
type Contract_3_header_getContext = Assert<
	Equal<typeof Actual3.header_getContext, ExpectedContracts['3_header_getContext']>
>;
type Contract_3_header_getLeafHeaders = Assert<
	Equal<typeof Actual3.header_getLeafHeaders, ExpectedContracts['3_header_getLeafHeaders']>
>;
type Contract_3_header_getResizeHandler = Assert<
	Equal<typeof Actual3.header_getResizeHandler, ExpectedContracts['3_header_getResizeHandler']>
>;
type Contract_3_header_getSize = Assert<
	Equal<typeof Actual3.header_getSize, ExpectedContracts['3_header_getSize']>
>;
type Contract_3_header_getStart = Assert<
	Equal<typeof Actual3.header_getStart, ExpectedContracts['3_header_getStart']>
>;
type Contract_3_isRowSelected = Assert<
	Equal<typeof Actual3.isRowSelected, ExpectedContracts['3_isRowSelected']>
>;
type Contract_3_isSubRowSelected = Assert<
	Equal<typeof Actual3.isSubRowSelected, ExpectedContracts['3_isSubRowSelected']>
>;
type Contract_3_isTouchStartEvent = Assert<
	Equal<typeof Actual3.isTouchStartEvent, ExpectedContracts['3_isTouchStartEvent']>
>;
type Contract_3_normalizeAggregationRows = Assert<
	Equal<typeof Actual3.normalizeAggregationRows, ExpectedContracts['3_normalizeAggregationRows']>
>;
type Contract_3_normalizeUniqueAggregationRows = Assert<
	Equal<
		typeof Actual3.normalizeUniqueAggregationRows,
		ExpectedContracts['3_normalizeUniqueAggregationRows']
	>
>;
type Contract_3_orderColumns = Assert<
	Equal<typeof Actual3.orderColumns, ExpectedContracts['3_orderColumns']>
>;
type Contract_3_passiveEventSupported = Assert<
	Equal<typeof Actual3.passiveEventSupported, ExpectedContracts['3_passiveEventSupported']>
>;
type Contract_3_row_getAllCells = Assert<
	Equal<typeof Actual3.row_getAllCells, ExpectedContracts['3_row_getAllCells']>
>;
type Contract_3_row_getAllCellsByColumnId = Assert<
	Equal<typeof Actual3.row_getAllCellsByColumnId, ExpectedContracts['3_row_getAllCellsByColumnId']>
>;
type Contract_3_row_getCanExpand = Assert<
	Equal<typeof Actual3.row_getCanExpand, ExpectedContracts['3_row_getCanExpand']>
>;
type Contract_3_row_getCanMultiSelect = Assert<
	Equal<typeof Actual3.row_getCanMultiSelect, ExpectedContracts['3_row_getCanMultiSelect']>
>;
type Contract_3_row_getCanPin = Assert<
	Equal<typeof Actual3.row_getCanPin, ExpectedContracts['3_row_getCanPin']>
>;
type Contract_3_row_getCanSelect = Assert<
	Equal<typeof Actual3.row_getCanSelect, ExpectedContracts['3_row_getCanSelect']>
>;
type Contract_3_row_getCanSelectSubRows = Assert<
	Equal<typeof Actual3.row_getCanSelectSubRows, ExpectedContracts['3_row_getCanSelectSubRows']>
>;
type Contract_3_row_getCenterVisibleCells = Assert<
	Equal<typeof Actual3.row_getCenterVisibleCells, ExpectedContracts['3_row_getCenterVisibleCells']>
>;
type Contract_3_row_getDisplayIndex = Assert<
	Equal<typeof Actual3.row_getDisplayIndex, ExpectedContracts['3_row_getDisplayIndex']>
>;
type Contract_3_row_getEndVisibleCells = Assert<
	Equal<typeof Actual3.row_getEndVisibleCells, ExpectedContracts['3_row_getEndVisibleCells']>
>;
type Contract_3_row_getGroupingValue = Assert<
	Equal<typeof Actual3.row_getGroupingValue, ExpectedContracts['3_row_getGroupingValue']>
>;
type Contract_3_row_getIsAllParentsExpanded = Assert<
	Equal<
		typeof Actual3.row_getIsAllParentsExpanded,
		ExpectedContracts['3_row_getIsAllParentsExpanded']
	>
>;
type Contract_3_row_getIsAllSubRowsSelected = Assert<
	Equal<
		typeof Actual3.row_getIsAllSubRowsSelected,
		ExpectedContracts['3_row_getIsAllSubRowsSelected']
	>
>;
type Contract_3_row_getIsExpanded = Assert<
	Equal<typeof Actual3.row_getIsExpanded, ExpectedContracts['3_row_getIsExpanded']>
>;
type Contract_3_row_getIsGrouped = Assert<
	Equal<typeof Actual3.row_getIsGrouped, ExpectedContracts['3_row_getIsGrouped']>
>;
type Contract_3_row_getIsPinned = Assert<
	Equal<typeof Actual3.row_getIsPinned, ExpectedContracts['3_row_getIsPinned']>
>;
type Contract_3_row_getIsSelected = Assert<
	Equal<typeof Actual3.row_getIsSelected, ExpectedContracts['3_row_getIsSelected']>
>;
type Contract_3_row_getIsSomeSelected = Assert<
	Equal<typeof Actual3.row_getIsSomeSelected, ExpectedContracts['3_row_getIsSomeSelected']>
>;
type Contract_3_row_getLeafRows = Assert<
	Equal<typeof Actual3.row_getLeafRows, ExpectedContracts['3_row_getLeafRows']>
>;
type Contract_3_row_getParentRow = Assert<
	Equal<typeof Actual3.row_getParentRow, ExpectedContracts['3_row_getParentRow']>
>;
type Contract_3_row_getParentRows = Assert<
	Equal<typeof Actual3.row_getParentRows, ExpectedContracts['3_row_getParentRows']>
>;
type Contract_3_row_getPinnedIndex = Assert<
	Equal<typeof Actual3.row_getPinnedIndex, ExpectedContracts['3_row_getPinnedIndex']>
>;
type Contract_3_row_getStartVisibleCells = Assert<
	Equal<typeof Actual3.row_getStartVisibleCells, ExpectedContracts['3_row_getStartVisibleCells']>
>;
type Contract_3_row_getToggleExpandedHandler = Assert<
	Equal<
		typeof Actual3.row_getToggleExpandedHandler,
		ExpectedContracts['3_row_getToggleExpandedHandler']
	>
>;
type Contract_3_row_getToggleSelectedHandler = Assert<
	Equal<
		typeof Actual3.row_getToggleSelectedHandler,
		ExpectedContracts['3_row_getToggleSelectedHandler']
	>
>;
type Contract_3_row_getUniqueValues = Assert<
	Equal<typeof Actual3.row_getUniqueValues, ExpectedContracts['3_row_getUniqueValues']>
>;
type Contract_3_row_getValue = Assert<
	Equal<typeof Actual3.row_getValue, ExpectedContracts['3_row_getValue']>
>;
type Contract_3_row_getVisibleCells = Assert<
	Equal<typeof Actual3.row_getVisibleCells, ExpectedContracts['3_row_getVisibleCells']>
>;
type Contract_3_row_getVisibleCellsByColumnId = Assert<
	Equal<
		typeof Actual3.row_getVisibleCellsByColumnId,
		ExpectedContracts['3_row_getVisibleCellsByColumnId']
	>
>;
type Contract_3_row_pin = Assert<Equal<typeof Actual3.row_pin, ExpectedContracts['3_row_pin']>>;
type Contract_3_row_renderValue = Assert<
	Equal<typeof Actual3.row_renderValue, ExpectedContracts['3_row_renderValue']>
>;
type Contract_3_row_toggleExpanded = Assert<
	Equal<typeof Actual3.row_toggleExpanded, ExpectedContracts['3_row_toggleExpanded']>
>;
type Contract_3_row_toggleSelected = Assert<
	Equal<typeof Actual3.row_toggleSelected, ExpectedContracts['3_row_toggleSelected']>
>;
type Contract_3_selectRowsFn = Assert<
	Equal<typeof Actual3.selectRowsFn, ExpectedContracts['3_selectRowsFn']>
>;
type Contract_3_shouldAutoRemoveFilter = Assert<
	Equal<typeof Actual3.shouldAutoRemoveFilter, ExpectedContracts['3_shouldAutoRemoveFilter']>
>;
type Contract_3_table_autoResetCellSelection = Assert<
	Equal<
		typeof Actual3.table_autoResetCellSelection,
		ExpectedContracts['3_table_autoResetCellSelection']
	>
>;
type Contract_3_table_autoResetExpanded = Assert<
	Equal<typeof Actual3.table_autoResetExpanded, ExpectedContracts['3_table_autoResetExpanded']>
>;
type Contract_3_table_autoResetPageIndex = Assert<
	Equal<typeof Actual3.table_autoResetPageIndex, ExpectedContracts['3_table_autoResetPageIndex']>
>;
type Contract_3_table_autoResetSorting = Assert<
	Equal<typeof Actual3.table_autoResetSorting, ExpectedContracts['3_table_autoResetSorting']>
>;
type Contract_3_table_extendCellSelection = Assert<
	Equal<typeof Actual3.table_extendCellSelection, ExpectedContracts['3_table_extendCellSelection']>
>;
type Contract_3_table_firstPage = Assert<
	Equal<typeof Actual3.table_firstPage, ExpectedContracts['3_table_firstPage']>
>;
type Contract_3_table_getAllColumns = Assert<
	Equal<typeof Actual3.table_getAllColumns, ExpectedContracts['3_table_getAllColumns']>
>;
type Contract_3_table_getAllFlatColumns = Assert<
	Equal<typeof Actual3.table_getAllFlatColumns, ExpectedContracts['3_table_getAllFlatColumns']>
>;
type Contract_3_table_getAllFlatColumnsById = Assert<
	Equal<
		typeof Actual3.table_getAllFlatColumnsById,
		ExpectedContracts['3_table_getAllFlatColumnsById']
	>
>;
type Contract_3_table_getAllLeafColumns = Assert<
	Equal<typeof Actual3.table_getAllLeafColumns, ExpectedContracts['3_table_getAllLeafColumns']>
>;
type Contract_3_table_getAllLeafColumnsById = Assert<
	Equal<
		typeof Actual3.table_getAllLeafColumnsById,
		ExpectedContracts['3_table_getAllLeafColumnsById']
	>
>;
type Contract_3_table_getBottomRows = Assert<
	Equal<typeof Actual3.table_getBottomRows, ExpectedContracts['3_table_getBottomRows']>
>;
type Contract_3_table_getCanLastPage = Assert<
	Equal<typeof Actual3.table_getCanLastPage, ExpectedContracts['3_table_getCanLastPage']>
>;
type Contract_3_table_getCanNextPage = Assert<
	Equal<typeof Actual3.table_getCanNextPage, ExpectedContracts['3_table_getCanNextPage']>
>;
type Contract_3_table_getCanPreviousPage = Assert<
	Equal<typeof Actual3.table_getCanPreviousPage, ExpectedContracts['3_table_getCanPreviousPage']>
>;
type Contract_3_table_getCanSomeRowsExpand = Assert<
	Equal<
		typeof Actual3.table_getCanSomeRowsExpand,
		ExpectedContracts['3_table_getCanSomeRowsExpand']
	>
>;
type Contract_3_table_getCellSelectionBounds = Assert<
	Equal<
		typeof Actual3.table_getCellSelectionBounds,
		ExpectedContracts['3_table_getCellSelectionBounds']
	>
>;
type Contract_3_table_getCellSelectionColumnIds = Assert<
	Equal<
		typeof Actual3.table_getCellSelectionColumnIds,
		ExpectedContracts['3_table_getCellSelectionColumnIds']
	>
>;
type Contract_3_table_getCellSelectionColumnIndexes = Assert<
	Equal<
		typeof Actual3.table_getCellSelectionColumnIndexes,
		ExpectedContracts['3_table_getCellSelectionColumnIndexes']
	>
>;
type Contract_3_table_getCellSelectionMergeBounds = Assert<
	Equal<
		typeof Actual3.table_getCellSelectionMergeBounds,
		ExpectedContracts['3_table_getCellSelectionMergeBounds']
	>
>;
type Contract_3_table_getCellSelectionRowIds = Assert<
	Equal<
		typeof Actual3.table_getCellSelectionRowIds,
		ExpectedContracts['3_table_getCellSelectionRowIds']
	>
>;
type Contract_3_table_getCellSpanIndex = Assert<
	Equal<typeof Actual3.table_getCellSpanIndex, ExpectedContracts['3_table_getCellSpanIndex']>
>;
type Contract_3_table_getCenterFlatHeaders = Assert<
	Equal<
		typeof Actual3.table_getCenterFlatHeaders,
		ExpectedContracts['3_table_getCenterFlatHeaders']
	>
>;
type Contract_3_table_getCenterFooterGroups = Assert<
	Equal<
		typeof Actual3.table_getCenterFooterGroups,
		ExpectedContracts['3_table_getCenterFooterGroups']
	>
>;
type Contract_3_table_getCenterHeaderGroups = Assert<
	Equal<
		typeof Actual3.table_getCenterHeaderGroups,
		ExpectedContracts['3_table_getCenterHeaderGroups']
	>
>;
type Contract_3_table_getCenterLeafColumns = Assert<
	Equal<
		typeof Actual3.table_getCenterLeafColumns,
		ExpectedContracts['3_table_getCenterLeafColumns']
	>
>;
type Contract_3_table_getCenterLeafHeaders = Assert<
	Equal<
		typeof Actual3.table_getCenterLeafHeaders,
		ExpectedContracts['3_table_getCenterLeafHeaders']
	>
>;
type Contract_3_table_getCenterRows = Assert<
	Equal<typeof Actual3.table_getCenterRows, ExpectedContracts['3_table_getCenterRows']>
>;
type Contract_3_table_getCenterTotalSize = Assert<
	Equal<typeof Actual3.table_getCenterTotalSize, ExpectedContracts['3_table_getCenterTotalSize']>
>;
type Contract_3_table_getCenterVisibleLeafColumns = Assert<
	Equal<
		typeof Actual3.table_getCenterVisibleLeafColumns,
		ExpectedContracts['3_table_getCenterVisibleLeafColumns']
	>
>;
type Contract_3_table_getColumn = Assert<
	Equal<typeof Actual3.table_getColumn, ExpectedContracts['3_table_getColumn']>
>;
type Contract_3_table_getColumnIndexes = Assert<
	Equal<typeof Actual3.table_getColumnIndexes, ExpectedContracts['3_table_getColumnIndexes']>
>;
type Contract_3_table_getColumnOffsets = Assert<
	Equal<typeof Actual3.table_getColumnOffsets, ExpectedContracts['3_table_getColumnOffsets']>
>;
type Contract_3_table_getCoreRowModel = Assert<
	Equal<typeof Actual3.table_getCoreRowModel, ExpectedContracts['3_table_getCoreRowModel']>
>;
type Contract_3_table_getDefaultColumnDef = Assert<
	Equal<typeof Actual3.table_getDefaultColumnDef, ExpectedContracts['3_table_getDefaultColumnDef']>
>;
type Contract_3_table_getEndFlatHeaders = Assert<
	Equal<typeof Actual3.table_getEndFlatHeaders, ExpectedContracts['3_table_getEndFlatHeaders']>
>;
type Contract_3_table_getEndFooterGroups = Assert<
	Equal<typeof Actual3.table_getEndFooterGroups, ExpectedContracts['3_table_getEndFooterGroups']>
>;
type Contract_3_table_getEndHeaderGroups = Assert<
	Equal<typeof Actual3.table_getEndHeaderGroups, ExpectedContracts['3_table_getEndHeaderGroups']>
>;
type Contract_3_table_getEndLeafColumns = Assert<
	Equal<typeof Actual3.table_getEndLeafColumns, ExpectedContracts['3_table_getEndLeafColumns']>
>;
type Contract_3_table_getEndLeafHeaders = Assert<
	Equal<typeof Actual3.table_getEndLeafHeaders, ExpectedContracts['3_table_getEndLeafHeaders']>
>;
type Contract_3_table_getEndTotalSize = Assert<
	Equal<typeof Actual3.table_getEndTotalSize, ExpectedContracts['3_table_getEndTotalSize']>
>;
type Contract_3_table_getEndVisibleLeafColumns = Assert<
	Equal<
		typeof Actual3.table_getEndVisibleLeafColumns,
		ExpectedContracts['3_table_getEndVisibleLeafColumns']
	>
>;
type Contract_3_table_getExpandedDepth = Assert<
	Equal<typeof Actual3.table_getExpandedDepth, ExpectedContracts['3_table_getExpandedDepth']>
>;
type Contract_3_table_getExpandedRowModel = Assert<
	Equal<typeof Actual3.table_getExpandedRowModel, ExpectedContracts['3_table_getExpandedRowModel']>
>;
type Contract_3_table_getFilteredRowModel = Assert<
	Equal<typeof Actual3.table_getFilteredRowModel, ExpectedContracts['3_table_getFilteredRowModel']>
>;
type Contract_3_table_getFilteredSelectedRowModel = Assert<
	Equal<
		typeof Actual3.table_getFilteredSelectedRowModel,
		ExpectedContracts['3_table_getFilteredSelectedRowModel']
	>
>;
type Contract_3_table_getFlatHeaders = Assert<
	Equal<typeof Actual3.table_getFlatHeaders, ExpectedContracts['3_table_getFlatHeaders']>
>;
type Contract_3_table_getFocusedCell = Assert<
	Equal<typeof Actual3.table_getFocusedCell, ExpectedContracts['3_table_getFocusedCell']>
>;
type Contract_3_table_getFooterGroups = Assert<
	Equal<typeof Actual3.table_getFooterGroups, ExpectedContracts['3_table_getFooterGroups']>
>;
type Contract_3_table_getGlobalAutoFilterFn = Assert<
	Equal<
		typeof Actual3.table_getGlobalAutoFilterFn,
		ExpectedContracts['3_table_getGlobalAutoFilterFn']
	>
>;
type Contract_3_table_getGlobalFacetedMinMaxValues = Assert<
	Equal<
		typeof Actual3.table_getGlobalFacetedMinMaxValues,
		ExpectedContracts['3_table_getGlobalFacetedMinMaxValues']
	>
>;
type Contract_3_table_getGlobalFacetedRowModel = Assert<
	Equal<
		typeof Actual3.table_getGlobalFacetedRowModel,
		ExpectedContracts['3_table_getGlobalFacetedRowModel']
	>
>;
type Contract_3_table_getGlobalFacetedUniqueValues = Assert<
	Equal<
		typeof Actual3.table_getGlobalFacetedUniqueValues,
		ExpectedContracts['3_table_getGlobalFacetedUniqueValues']
	>
>;
type Contract_3_table_getGlobalFilterFn = Assert<
	Equal<typeof Actual3.table_getGlobalFilterFn, ExpectedContracts['3_table_getGlobalFilterFn']>
>;
type Contract_3_table_getGroupedRowModel = Assert<
	Equal<typeof Actual3.table_getGroupedRowModel, ExpectedContracts['3_table_getGroupedRowModel']>
>;
type Contract_3_table_getGroupedSelectedRowModel = Assert<
	Equal<
		typeof Actual3.table_getGroupedSelectedRowModel,
		ExpectedContracts['3_table_getGroupedSelectedRowModel']
	>
>;
type Contract_3_table_getHeaderGroups = Assert<
	Equal<typeof Actual3.table_getHeaderGroups, ExpectedContracts['3_table_getHeaderGroups']>
>;
type Contract_3_table_getIsAllColumnsVisible = Assert<
	Equal<
		typeof Actual3.table_getIsAllColumnsVisible,
		ExpectedContracts['3_table_getIsAllColumnsVisible']
	>
>;
type Contract_3_table_getIsAllPageRowsSelected = Assert<
	Equal<
		typeof Actual3.table_getIsAllPageRowsSelected,
		ExpectedContracts['3_table_getIsAllPageRowsSelected']
	>
>;
type Contract_3_table_getIsAllRowsExpanded = Assert<
	Equal<
		typeof Actual3.table_getIsAllRowsExpanded,
		ExpectedContracts['3_table_getIsAllRowsExpanded']
	>
>;
type Contract_3_table_getIsAllRowsSelected = Assert<
	Equal<
		typeof Actual3.table_getIsAllRowsSelected,
		ExpectedContracts['3_table_getIsAllRowsSelected']
	>
>;
type Contract_3_table_getIsSomeColumnsPinned = Assert<
	Equal<
		typeof Actual3.table_getIsSomeColumnsPinned,
		ExpectedContracts['3_table_getIsSomeColumnsPinned']
	>
>;
type Contract_3_table_getIsSomeColumnsVisible = Assert<
	Equal<
		typeof Actual3.table_getIsSomeColumnsVisible,
		ExpectedContracts['3_table_getIsSomeColumnsVisible']
	>
>;
type Contract_3_table_getIsSomePageRowsSelected = Assert<
	Equal<
		typeof Actual3.table_getIsSomePageRowsSelected,
		ExpectedContracts['3_table_getIsSomePageRowsSelected']
	>
>;
type Contract_3_table_getIsSomeRowsExpanded = Assert<
	Equal<
		typeof Actual3.table_getIsSomeRowsExpanded,
		ExpectedContracts['3_table_getIsSomeRowsExpanded']
	>
>;
type Contract_3_table_getIsSomeRowsPinned = Assert<
	Equal<typeof Actual3.table_getIsSomeRowsPinned, ExpectedContracts['3_table_getIsSomeRowsPinned']>
>;
type Contract_3_table_getIsSomeRowsSelected = Assert<
	Equal<
		typeof Actual3.table_getIsSomeRowsSelected,
		ExpectedContracts['3_table_getIsSomeRowsSelected']
	>
>;
type Contract_3_table_getLeafHeaders = Assert<
	Equal<typeof Actual3.table_getLeafHeaders, ExpectedContracts['3_table_getLeafHeaders']>
>;
type Contract_3_table_getMaxSubRowDepth = Assert<
	Equal<typeof Actual3.table_getMaxSubRowDepth, ExpectedContracts['3_table_getMaxSubRowDepth']>
>;
type Contract_3_table_getOrderColumnsFn = Assert<
	Equal<typeof Actual3.table_getOrderColumnsFn, ExpectedContracts['3_table_getOrderColumnsFn']>
>;
type Contract_3_table_getPageCount = Assert<
	Equal<typeof Actual3.table_getPageCount, ExpectedContracts['3_table_getPageCount']>
>;
type Contract_3_table_getPageOptions = Assert<
	Equal<typeof Actual3.table_getPageOptions, ExpectedContracts['3_table_getPageOptions']>
>;
type Contract_3_table_getPaginatedRowModel = Assert<
	Equal<
		typeof Actual3.table_getPaginatedRowModel,
		ExpectedContracts['3_table_getPaginatedRowModel']
	>
>;
type Contract_3_table_getPinnedLeafColumns = Assert<
	Equal<
		typeof Actual3.table_getPinnedLeafColumns,
		ExpectedContracts['3_table_getPinnedLeafColumns']
	>
>;
type Contract_3_table_getPinnedVisibleLeafColumns = Assert<
	Equal<
		typeof Actual3.table_getPinnedVisibleLeafColumns,
		ExpectedContracts['3_table_getPinnedVisibleLeafColumns']
	>
>;
type Contract_3_table_getPreExpandedRowModel = Assert<
	Equal<
		typeof Actual3.table_getPreExpandedRowModel,
		ExpectedContracts['3_table_getPreExpandedRowModel']
	>
>;
type Contract_3_table_getPreFilteredRowModel = Assert<
	Equal<
		typeof Actual3.table_getPreFilteredRowModel,
		ExpectedContracts['3_table_getPreFilteredRowModel']
	>
>;
type Contract_3_table_getPreGroupedRowModel = Assert<
	Equal<
		typeof Actual3.table_getPreGroupedRowModel,
		ExpectedContracts['3_table_getPreGroupedRowModel']
	>
>;
type Contract_3_table_getPrePaginatedRowModel = Assert<
	Equal<
		typeof Actual3.table_getPrePaginatedRowModel,
		ExpectedContracts['3_table_getPrePaginatedRowModel']
	>
>;
type Contract_3_table_getPreSelectedRowModel = Assert<
	Equal<
		typeof Actual3.table_getPreSelectedRowModel,
		ExpectedContracts['3_table_getPreSelectedRowModel']
	>
>;
type Contract_3_table_getPreSortedRowModel = Assert<
	Equal<
		typeof Actual3.table_getPreSortedRowModel,
		ExpectedContracts['3_table_getPreSortedRowModel']
	>
>;
type Contract_3_table_getRow = Assert<
	Equal<typeof Actual3.table_getRow, ExpectedContracts['3_table_getRow']>
>;
type Contract_3_table_getRowCount = Assert<
	Equal<typeof Actual3.table_getRowCount, ExpectedContracts['3_table_getRowCount']>
>;
type Contract_3_table_getRowId = Assert<
	Equal<typeof Actual3.table_getRowId, ExpectedContracts['3_table_getRowId']>
>;
type Contract_3_table_getRowModel = Assert<
	Equal<typeof Actual3.table_getRowModel, ExpectedContracts['3_table_getRowModel']>
>;
type Contract_3_table_getRowsInDisplayOrder = Assert<
	Equal<
		typeof Actual3.table_getRowsInDisplayOrder,
		ExpectedContracts['3_table_getRowsInDisplayOrder']
	>
>;
type Contract_3_table_getSelectedCellCount = Assert<
	Equal<
		typeof Actual3.table_getSelectedCellCount,
		ExpectedContracts['3_table_getSelectedCellCount']
	>
>;
type Contract_3_table_getSelectedCellIds = Assert<
	Equal<typeof Actual3.table_getSelectedCellIds, ExpectedContracts['3_table_getSelectedCellIds']>
>;
type Contract_3_table_getSelectedCellRangesData = Assert<
	Equal<
		typeof Actual3.table_getSelectedCellRangesData,
		ExpectedContracts['3_table_getSelectedCellRangesData']
	>
>;
type Contract_3_table_getSelectedRowIds = Assert<
	Equal<typeof Actual3.table_getSelectedRowIds, ExpectedContracts['3_table_getSelectedRowIds']>
>;
type Contract_3_table_getSelectedRowModel = Assert<
	Equal<typeof Actual3.table_getSelectedRowModel, ExpectedContracts['3_table_getSelectedRowModel']>
>;
type Contract_3_table_getSortedRowModel = Assert<
	Equal<typeof Actual3.table_getSortedRowModel, ExpectedContracts['3_table_getSortedRowModel']>
>;
type Contract_3_table_getStartFlatHeaders = Assert<
	Equal<typeof Actual3.table_getStartFlatHeaders, ExpectedContracts['3_table_getStartFlatHeaders']>
>;
type Contract_3_table_getStartFooterGroups = Assert<
	Equal<
		typeof Actual3.table_getStartFooterGroups,
		ExpectedContracts['3_table_getStartFooterGroups']
	>
>;
type Contract_3_table_getStartHeaderGroups = Assert<
	Equal<
		typeof Actual3.table_getStartHeaderGroups,
		ExpectedContracts['3_table_getStartHeaderGroups']
	>
>;
type Contract_3_table_getStartLeafColumns = Assert<
	Equal<typeof Actual3.table_getStartLeafColumns, ExpectedContracts['3_table_getStartLeafColumns']>
>;
type Contract_3_table_getStartLeafHeaders = Assert<
	Equal<typeof Actual3.table_getStartLeafHeaders, ExpectedContracts['3_table_getStartLeafHeaders']>
>;
type Contract_3_table_getStartTotalSize = Assert<
	Equal<typeof Actual3.table_getStartTotalSize, ExpectedContracts['3_table_getStartTotalSize']>
>;
type Contract_3_table_getStartVisibleLeafColumns = Assert<
	Equal<
		typeof Actual3.table_getStartVisibleLeafColumns,
		ExpectedContracts['3_table_getStartVisibleLeafColumns']
	>
>;
type Contract_3_table_getToggleAllColumnsVisibilityHandler = Assert<
	Equal<
		typeof Actual3.table_getToggleAllColumnsVisibilityHandler,
		ExpectedContracts['3_table_getToggleAllColumnsVisibilityHandler']
	>
>;
type Contract_3_table_getToggleAllPageRowsSelectedHandler = Assert<
	Equal<
		typeof Actual3.table_getToggleAllPageRowsSelectedHandler,
		ExpectedContracts['3_table_getToggleAllPageRowsSelectedHandler']
	>
>;
type Contract_3_table_getToggleAllRowsExpandedHandler = Assert<
	Equal<
		typeof Actual3.table_getToggleAllRowsExpandedHandler,
		ExpectedContracts['3_table_getToggleAllRowsExpandedHandler']
	>
>;
type Contract_3_table_getToggleAllRowsSelectedHandler = Assert<
	Equal<
		typeof Actual3.table_getToggleAllRowsSelectedHandler,
		ExpectedContracts['3_table_getToggleAllRowsSelectedHandler']
	>
>;
type Contract_3_table_getTopRows = Assert<
	Equal<typeof Actual3.table_getTopRows, ExpectedContracts['3_table_getTopRows']>
>;
type Contract_3_table_getTotalSize = Assert<
	Equal<typeof Actual3.table_getTotalSize, ExpectedContracts['3_table_getTotalSize']>
>;
type Contract_3_table_getVisibleFlatColumns = Assert<
	Equal<
		typeof Actual3.table_getVisibleFlatColumns,
		ExpectedContracts['3_table_getVisibleFlatColumns']
	>
>;
type Contract_3_table_getVisibleLeafColumns = Assert<
	Equal<
		typeof Actual3.table_getVisibleLeafColumns,
		ExpectedContracts['3_table_getVisibleLeafColumns']
	>
>;
type Contract_3_table_lastPage = Assert<
	Equal<typeof Actual3.table_lastPage, ExpectedContracts['3_table_lastPage']>
>;
type Contract_3_table_mergeOptions = Assert<
	Equal<typeof Actual3.table_mergeOptions, ExpectedContracts['3_table_mergeOptions']>
>;
type Contract_3_table_moveCellSelection = Assert<
	Equal<typeof Actual3.table_moveCellSelection, ExpectedContracts['3_table_moveCellSelection']>
>;
type Contract_3_table_nextPage = Assert<
	Equal<typeof Actual3.table_nextPage, ExpectedContracts['3_table_nextPage']>
>;
type Contract_3_table_previousPage = Assert<
	Equal<typeof Actual3.table_previousPage, ExpectedContracts['3_table_previousPage']>
>;
type Contract_3_table_publishExternalState = Assert<
	Equal<
		typeof Actual3.table_publishExternalState,
		ExpectedContracts['3_table_publishExternalState']
	>
>;
type Contract_3_table_reset = Assert<
	Equal<typeof Actual3.table_reset, ExpectedContracts['3_table_reset']>
>;
type Contract_3_table_resetCellSelection = Assert<
	Equal<typeof Actual3.table_resetCellSelection, ExpectedContracts['3_table_resetCellSelection']>
>;
type Contract_3_table_resetColumnFilters = Assert<
	Equal<typeof Actual3.table_resetColumnFilters, ExpectedContracts['3_table_resetColumnFilters']>
>;
type Contract_3_table_resetColumnOrder = Assert<
	Equal<typeof Actual3.table_resetColumnOrder, ExpectedContracts['3_table_resetColumnOrder']>
>;
type Contract_3_table_resetColumnPinning = Assert<
	Equal<typeof Actual3.table_resetColumnPinning, ExpectedContracts['3_table_resetColumnPinning']>
>;
type Contract_3_table_resetColumnSizing = Assert<
	Equal<typeof Actual3.table_resetColumnSizing, ExpectedContracts['3_table_resetColumnSizing']>
>;
type Contract_3_table_resetColumnVisibility = Assert<
	Equal<
		typeof Actual3.table_resetColumnVisibility,
		ExpectedContracts['3_table_resetColumnVisibility']
	>
>;
type Contract_3_table_resetExpanded = Assert<
	Equal<typeof Actual3.table_resetExpanded, ExpectedContracts['3_table_resetExpanded']>
>;
type Contract_3_table_resetGlobalFilter = Assert<
	Equal<typeof Actual3.table_resetGlobalFilter, ExpectedContracts['3_table_resetGlobalFilter']>
>;
type Contract_3_table_resetGrouping = Assert<
	Equal<typeof Actual3.table_resetGrouping, ExpectedContracts['3_table_resetGrouping']>
>;
type Contract_3_table_resetHeaderSizeInfo = Assert<
	Equal<typeof Actual3.table_resetHeaderSizeInfo, ExpectedContracts['3_table_resetHeaderSizeInfo']>
>;
type Contract_3_table_resetPageIndex = Assert<
	Equal<typeof Actual3.table_resetPageIndex, ExpectedContracts['3_table_resetPageIndex']>
>;
type Contract_3_table_resetPageSize = Assert<
	Equal<typeof Actual3.table_resetPageSize, ExpectedContracts['3_table_resetPageSize']>
>;
type Contract_3_table_resetPagination = Assert<
	Equal<typeof Actual3.table_resetPagination, ExpectedContracts['3_table_resetPagination']>
>;
type Contract_3_table_resetRowPinning = Assert<
	Equal<typeof Actual3.table_resetRowPinning, ExpectedContracts['3_table_resetRowPinning']>
>;
type Contract_3_table_resetRowSelection = Assert<
	Equal<typeof Actual3.table_resetRowSelection, ExpectedContracts['3_table_resetRowSelection']>
>;
type Contract_3_table_resetSorting = Assert<
	Equal<typeof Actual3.table_resetSorting, ExpectedContracts['3_table_resetSorting']>
>;
type Contract_3_table_selectAllCells = Assert<
	Equal<typeof Actual3.table_selectAllCells, ExpectedContracts['3_table_selectAllCells']>
>;
type Contract_3_table_selectCellRange = Assert<
	Equal<typeof Actual3.table_selectCellRange, ExpectedContracts['3_table_selectCellRange']>
>;
type Contract_3_table_setCellSelection = Assert<
	Equal<typeof Actual3.table_setCellSelection, ExpectedContracts['3_table_setCellSelection']>
>;
type Contract_3_table_setColumnFilters = Assert<
	Equal<typeof Actual3.table_setColumnFilters, ExpectedContracts['3_table_setColumnFilters']>
>;
type Contract_3_table_setColumnOrder = Assert<
	Equal<typeof Actual3.table_setColumnOrder, ExpectedContracts['3_table_setColumnOrder']>
>;
type Contract_3_table_setColumnPinning = Assert<
	Equal<typeof Actual3.table_setColumnPinning, ExpectedContracts['3_table_setColumnPinning']>
>;
type Contract_3_table_setColumnResizing = Assert<
	Equal<typeof Actual3.table_setColumnResizing, ExpectedContracts['3_table_setColumnResizing']>
>;
type Contract_3_table_setColumnSizing = Assert<
	Equal<typeof Actual3.table_setColumnSizing, ExpectedContracts['3_table_setColumnSizing']>
>;
type Contract_3_table_setColumnVisibility = Assert<
	Equal<typeof Actual3.table_setColumnVisibility, ExpectedContracts['3_table_setColumnVisibility']>
>;
type Contract_3_table_setExpanded = Assert<
	Equal<typeof Actual3.table_setExpanded, ExpectedContracts['3_table_setExpanded']>
>;
type Contract_3_table_setFocusedCell = Assert<
	Equal<typeof Actual3.table_setFocusedCell, ExpectedContracts['3_table_setFocusedCell']>
>;
type Contract_3_table_setGlobalFilter = Assert<
	Equal<typeof Actual3.table_setGlobalFilter, ExpectedContracts['3_table_setGlobalFilter']>
>;
type Contract_3_table_setGrouping = Assert<
	Equal<typeof Actual3.table_setGrouping, ExpectedContracts['3_table_setGrouping']>
>;
type Contract_3_table_setOptions = Assert<
	Equal<typeof Actual3.table_setOptions, ExpectedContracts['3_table_setOptions']>
>;
type Contract_3_table_setPageIndex = Assert<
	Equal<typeof Actual3.table_setPageIndex, ExpectedContracts['3_table_setPageIndex']>
>;
type Contract_3_table_setPageSize = Assert<
	Equal<typeof Actual3.table_setPageSize, ExpectedContracts['3_table_setPageSize']>
>;
type Contract_3_table_setPagination = Assert<
	Equal<typeof Actual3.table_setPagination, ExpectedContracts['3_table_setPagination']>
>;
type Contract_3_table_setRowPinning = Assert<
	Equal<typeof Actual3.table_setRowPinning, ExpectedContracts['3_table_setRowPinning']>
>;
type Contract_3_table_setRowSelection = Assert<
	Equal<typeof Actual3.table_setRowSelection, ExpectedContracts['3_table_setRowSelection']>
>;
type Contract_3_table_setSorting = Assert<
	Equal<typeof Actual3.table_setSorting, ExpectedContracts['3_table_setSorting']>
>;
type Contract_3_table_syncExternalStateToBaseAtoms = Assert<
	Equal<
		typeof Actual3.table_syncExternalStateToBaseAtoms,
		ExpectedContracts['3_table_syncExternalStateToBaseAtoms']
	>
>;
type Contract_3_table_toggleAllColumnsVisible = Assert<
	Equal<
		typeof Actual3.table_toggleAllColumnsVisible,
		ExpectedContracts['3_table_toggleAllColumnsVisible']
	>
>;
type Contract_3_table_toggleAllPageRowsSelected = Assert<
	Equal<
		typeof Actual3.table_toggleAllPageRowsSelected,
		ExpectedContracts['3_table_toggleAllPageRowsSelected']
	>
>;
type Contract_3_table_toggleAllRowsExpanded = Assert<
	Equal<
		typeof Actual3.table_toggleAllRowsExpanded,
		ExpectedContracts['3_table_toggleAllRowsExpanded']
	>
>;
type Contract_3_table_toggleAllRowsSelected = Assert<
	Equal<
		typeof Actual3.table_toggleAllRowsSelected,
		ExpectedContracts['3_table_toggleAllRowsSelected']
	>
>;
type Contract_4_TableState_WorkerRowModels = Assert<
	Equal<Actual4.TableState_WorkerRowModels, ExpectedContracts['4_TableState_WorkerRowModels']>
>;
type Contract_4_TableWorker = Assert<
	Equal<Actual4.TableWorker, ExpectedContracts['4_TableWorker']>
>;
type Contract_4_TableWorkerBridge = Assert<
	Equal<Actual4.TableWorkerBridge, ExpectedContracts['4_TableWorkerBridge']>
>;
type Contract_4_TableWorkerConfig = Assert<
	Equal<Actual4.TableWorkerConfig<Features, Person>, ExpectedContracts['4_TableWorkerConfig']>
>;
type Contract_4_TableWorkerDataNode = Assert<
	Equal<Actual4.TableWorkerDataNode, ExpectedContracts['4_TableWorkerDataNode']>
>;
type Contract_4_TableWorkerFilterData = Assert<
	Equal<Actual4.TableWorkerFilterData, ExpectedContracts['4_TableWorkerFilterData']>
>;
type Contract_4_TableWorkerGroupNode = Assert<
	Equal<Actual4.TableWorkerGroupNode, ExpectedContracts['4_TableWorkerGroupNode']>
>;
type Contract_4_TableWorkerOptions = Assert<
	Equal<Actual4.TableWorkerOptions, ExpectedContracts['4_TableWorkerOptions']>
>;
type Contract_4_TableWorkerRequest = Assert<
	Equal<Actual4.TableWorkerRequest, ExpectedContracts['4_TableWorkerRequest']>
>;
type Contract_4_TableWorkerResponse = Assert<
	Equal<Actual4.TableWorkerResponse, ExpectedContracts['4_TableWorkerResponse']>
>;
type Contract_4_TableWorkerResult = Assert<
	Equal<Actual4.TableWorkerResult, ExpectedContracts['4_TableWorkerResult']>
>;
type Contract_4_TableWorkerRowNode = Assert<
	Equal<Actual4.TableWorkerRowNode, ExpectedContracts['4_TableWorkerRowNode']>
>;
type Contract_4_TableWorkerStage = Assert<
	Equal<Actual4.TableWorkerStage, ExpectedContracts['4_TableWorkerStage']>
>;
type Contract_4_TableWorkerStagePayload = Assert<
	Equal<Actual4.TableWorkerStagePayload, ExpectedContracts['4_TableWorkerStagePayload']>
>;
type Contract_4_createTableWorker = Assert<
	Equal<typeof Actual4.createTableWorker, ExpectedContracts['4_createTableWorker']>
>;
type Contract_4_createWorkerRowModel = Assert<
	Equal<typeof Actual4.createWorkerRowModel, ExpectedContracts['4_createWorkerRowModel']>
>;
type Contract_4_getTableWorkerBridge = Assert<
	Equal<typeof Actual4.getTableWorkerBridge, ExpectedContracts['4_getTableWorkerBridge']>
>;
type Contract_4_initTableWorker = Assert<
	Equal<typeof Actual4.initTableWorker, ExpectedContracts['4_initTableWorker']>
>;
type Contract_4_syncTableWorker = Assert<
	Equal<typeof Actual4.syncTableWorker, ExpectedContracts['4_syncTableWorker']>
>;
type Contract_4_tableWorkerPipeline = Assert<
	Equal<typeof Actual4.tableWorkerPipeline, ExpectedContracts['4_tableWorkerPipeline']>
>;
type Contract_4_tableWorkerStageStateDeps = Assert<
	Equal<typeof Actual4.tableWorkerStageStateDeps, ExpectedContracts['4_tableWorkerStageStateDeps']>
>;
type Contract_4_workerRowModelsFeature = Assert<
	Equal<typeof Actual4.workerRowModelsFeature, ExpectedContracts['4_workerRowModelsFeature']>
>;
const table = Actual0.useTable(
	{
		features: Actual0.stockFeatures,
		data: [{ id: '1', name: 'Ada' }],
		columns: [{ accessorKey: 'name' }],
	},
	(state) => state.pagination.pageIndex,
);
type Selected = Assert<Equal<typeof table.state, number>>;
type Original = Assert<
	Equal<
		(typeof table)['getRowModel'] extends (...args: []) => infer R
			? R extends { rows: Array<{ original: infer V }> }
				? V
				: never
			: never,
		Person
	>
>;
const legacy = Actual2.useLegacyTable({
	data: [{ id: '1', name: 'Ada' }],
	columns: [{ accessorKey: 'name' }],
	getSortedRowModel: Actual2.getSortedRowModel(),
});
type LegacyState = Assert<
	Equal<ReturnType<typeof legacy.getState>, Actual0.TableState<Actual2.LegacyFeatures>>
>;
const column = Actual2.legacyCreateColumnHelper<Person>().accessor('name', {
	cell: (context) => context.getValue(),
});
// @ts-expect-error the public hook requires options
Actual0.useTable();
// @ts-expect-error a selector's numeric result has no pagination property
table.state.pagination;
// @ts-expect-error legacy data accessors must belong to Person
Actual2.legacyCreateColumnHelper<Person>().accessor('missing', {});
// @ts-expect-error exactly one FlexRender cell/header/footer is required
Actual0.FlexRender({});
