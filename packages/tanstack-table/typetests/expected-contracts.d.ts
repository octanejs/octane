import * as Expected0 from '@tanstack/react-table';
import * as Expected1 from '@tanstack/react-table/flex-render';
import * as Expected2 from '@tanstack/react-table/legacy';
import * as Expected3 from '@tanstack/react-table/static-functions';
import * as Expected4 from '@tanstack/react-table/experimental-worker-plugin';
type Features = Expected0.StockFeatures;
type Person = { id: string; name: string };
export interface ExpectedContracts {
	'0_AppCellComponent': Parameters<
		Expected0.AppCellComponent<Features, Person, { Label: (props: { value: string }) => string }>
	>['length'];
	'0_AppCellContext': keyof Expected0.AppCellContext<
		Features,
		Person,
		string,
		{ Label: (props: { value: string }) => string }
	>;
	'0_AppCellPropsWithSelector': keyof Expected0.AppCellPropsWithSelector<
		Features,
		Person,
		string,
		{ Label: (props: { value: string }) => string },
		{ pageIndex: number }
	>;
	'0_AppCellPropsWithoutSelector': keyof Expected0.AppCellPropsWithoutSelector<
		Features,
		Person,
		string,
		{ Label: (props: { value: string }) => string }
	>;
	'0_AppColumnDefBase': keyof Expected0.AppColumnDefBase<
		Features,
		Person,
		string,
		{ Label: (props: { value: string }) => string },
		{ Label: (props: { value: string }) => string }
	>;
	'0_AppColumnDefTemplate': keyof Expected0.AppColumnDefTemplate<{ value: string }>;
	'0_AppColumnHelper': keyof Expected0.AppColumnHelper<
		Features,
		Person,
		{ Label: (props: { value: string }) => string },
		{ Label: (props: { value: string }) => string }
	>;
	'0_AppDisplayColumnDef': keyof Expected0.AppDisplayColumnDef<
		Features,
		Person,
		{ Label: (props: { value: string }) => string },
		{ Label: (props: { value: string }) => string }
	>;
	'0_AppGroupColumnDef': keyof Expected0.AppGroupColumnDef<
		Features,
		Person,
		{ Label: (props: { value: string }) => string },
		{ Label: (props: { value: string }) => string }
	>;
	'0_AppHeaderComponent': Parameters<
		Expected0.AppHeaderComponent<Features, Person, { Label: (props: { value: string }) => string }>
	>['length'];
	'0_AppHeaderContext': keyof Expected0.AppHeaderContext<
		Features,
		Person,
		string,
		{ Label: (props: { value: string }) => string }
	>;
	'0_AppHeaderPropsWithSelector': keyof Expected0.AppHeaderPropsWithSelector<
		Features,
		Person,
		string,
		{ Label: (props: { value: string }) => string },
		{ pageIndex: number }
	>;
	'0_AppHeaderPropsWithoutSelector': keyof Expected0.AppHeaderPropsWithoutSelector<
		Features,
		Person,
		string,
		{ Label: (props: { value: string }) => string }
	>;
	'0_AppReactTable': keyof Expected0.AppReactTable<
		Features,
		Person,
		{ pageIndex: number },
		{ Label: (props: { value: string }) => string },
		{ Label: (props: { value: string }) => string },
		{ Label: (props: { value: string }) => string }
	>;
	'0_AppTableComponent': Parameters<Expected0.AppTableComponent<Features>>['length'];
	'0_AppTablePropsWithSelector': keyof Expected0.AppTablePropsWithSelector<
		Features,
		{ pageIndex: number }
	>;
	'0_AppTablePropsWithoutSelector': keyof Expected0.AppTablePropsWithoutSelector;
	'0_CreateTableHookOptions': keyof Expected0.CreateTableHookOptions<
		Features,
		{ Label: (props: { value: string }) => string },
		{ Label: (props: { value: string }) => string },
		{ Label: (props: { value: string }) => string }
	>;
	'0_CreateTableHookResult': keyof Expected0.CreateTableHookResult<
		Features,
		{ Label: (props: { value: string }) => string },
		{ Label: (props: { value: string }) => string },
		{ Label: (props: { value: string }) => string }
	>;
	'0_FlexRender': Parameters<typeof Expected0.FlexRender>['length'];
	'0_FlexRenderProps': keyof Expected0.FlexRenderProps<Features, Person>;
	'0_ReactTable': keyof Expected0.ReactTable<Features, Person>;
	'0_Renderable': keyof Expected0.Renderable<{ value: string }>;
	'0_Subscribe': Parameters<typeof Expected0.Subscribe>['length'];
	'0_SubscribeProps': keyof Expected0.SubscribeProps<Features>;
	'0_SubscribePropsWithSource': keyof Expected0.SubscribePropsWithSource<string>;
	'0_SubscribePropsWithSourceIdentity': keyof Expected0.SubscribePropsWithSourceIdentity<string>;
	'0_SubscribePropsWithSourceWithSelector': keyof Expected0.SubscribePropsWithSourceWithSelector<
		string,
		{ pageIndex: number }
	>;
	'0_SubscribePropsWithStore': keyof Expected0.SubscribePropsWithStore<
		Features,
		{ pageIndex: number }
	>;
	'0_SubscribeSource': keyof Expected0.SubscribeSource<string>;
	'0_TableHookContexts': keyof Expected0.TableHookContexts<Features, Person>;
	'0_createTableHook': Parameters<typeof Expected0.createTableHook>['length'];
	'0_createTableHookContexts': Parameters<typeof Expected0.createTableHookContexts>['length'];
	'0_flexRender': Parameters<typeof Expected0.flexRender>['length'];
	'0_useTable': Parameters<typeof Expected0.useTable>['length'];
	'0_API': Expected0.API<[string, number], { sample: string }>;
	'0_APIObject': Expected0.APIObject<[string, number], { sample: string }>;
	'0_AccessorColumnDef': Expected0.AccessorColumnDef<Features, Person>;
	'0_AccessorFn': Expected0.AccessorFn<Person>;
	'0_AccessorFnColumnDef': Expected0.AccessorFnColumnDef<Features, Person>;
	'0_AccessorFnColumnDefBase': Expected0.AccessorFnColumnDefBase<Features, Person>;
	'0_AccessorKeyColumnDef': Expected0.AccessorKeyColumnDef<Features, Person>;
	'0_AccessorKeyColumnDefBase': Expected0.AccessorKeyColumnDefBase<Features, Person>;
	'0_AggregationContext': Expected0.AggregationContext<Features, Person>;
	'0_AggregationFnDef': Expected0.AggregationFnDef;
	'0_AggregationFnDescriptor': Expected0.AggregationFnDescriptor<Features, Person>;
	'0_AggregationFnListItem': Expected0.AggregationFnListItem<Features, Person>;
	'0_AggregationFnOption': Expected0.AggregationFnOption<Features, Person>;
	'0_AggregationFnRef': Expected0.AggregationFnRef<Features, Person>;
	'0_AggregationFns': Expected0.AggregationFns;
	'0_AggregationMergeContext': Expected0.AggregationMergeContext<
		Features,
		Person,
		string,
		{ sample: string }
	>;
	'0_AggregationResult': Expected0.AggregationResult<{ sample: string }>;
	'0_AggregationResultOf': Expected0.AggregationResultOf<{ sample: string }>;
	'0_AggregationValueContext': Expected0.AggregationValueContext<Features, Person>;
	'0_AggregationValueOptions': Expected0.AggregationValueOptions<Features, Person>;
	'0_AggregationValueResult': Expected0.AggregationValueResult;
	'0_Atoms': Expected0.Atoms<Features>;
	'0_Atoms_All': Expected0.Atoms_All;
	'0_BaseAtoms': Expected0.BaseAtoms<Features>;
	'0_BaseAtoms_All': Expected0.BaseAtoms_All;
	'0_BuiltInAggregationFn': Expected0.BuiltInAggregationFn;
	'0_BuiltInFilterFn': Expected0.BuiltInFilterFn;
	'0_BuiltInSortFn': Expected0.BuiltInSortFn;
	'0_CachedRowModel_All': Expected0.CachedRowModel_All<Features>;
	'0_CachedRowModel_Core': Expected0.CachedRowModel_Core<Features, Person>;
	'0_CachedRowModel_Expanded': Expected0.CachedRowModel_Expanded<Features, Person>;
	'0_CachedRowModel_Faceted': Expected0.CachedRowModel_Faceted<Features, Person>;
	'0_CachedRowModel_Filtered': Expected0.CachedRowModel_Filtered<Features, Person>;
	'0_CachedRowModel_Grouped': Expected0.CachedRowModel_Grouped<Features, Person>;
	'0_CachedRowModel_Paginated': Expected0.CachedRowModel_Paginated<Features, Person>;
	'0_CachedRowModel_Sorted': Expected0.CachedRowModel_Sorted<Features, Person>;
	'0_CachedRowModels': Expected0.CachedRowModels<Features, Person>;
	'0_CachedRowModels_FeatureMap': Expected0.CachedRowModels_FeatureMap<Features, Person>;
	'0_Cell': Expected0.Cell<Features, Person>;
	'0_CellContext': Expected0.CellContext<Features, Person>;
	'0_CellData': Expected0.CellData;
	'0_CellSelectionBounds': Expected0.CellSelectionBounds;
	'0_CellSelectionDirection': Expected0.CellSelectionDirection;
	'0_CellSelectionEdges': Expected0.CellSelectionEdges;
	'0_CellSelectionRange': Expected0.CellSelectionRange;
	'0_CellSelectionRangeMode': Expected0.CellSelectionRangeMode;
	'0_CellSelectionRangeOperation': Expected0.CellSelectionRangeOperation;
	'0_CellSelectionState': Expected0.CellSelectionState;
	'0_CellSpanIndex': Expected0.CellSpanIndex<Features, Person>;
	'0_Cell_Cell': Expected0.Cell_Cell<Features, Person>;
	'0_Cell_CellSelection': Expected0.Cell_CellSelection;
	'0_Cell_CellSpanning': Expected0.Cell_CellSpanning;
	'0_Cell_ColumnGrouping': Expected0.Cell_ColumnGrouping;
	'0_Cell_Core': Expected0.Cell_Core<Features, Person>;
	'0_Cell_CoreProperties': Expected0.Cell_CoreProperties<Features, Person>;
	'0_Cell_FeatureMap': Expected0.Cell_FeatureMap;
	'0_Cell_RowAggregation': Expected0.Cell_RowAggregation;
	'0_ColSpanContext': Expected0.ColSpanContext<Features, Person>;
	'0_Column': Expected0.Column<Features, Person>;
	'0_ColumnAggregationValue': Expected0.ColumnAggregationValue<Features>;
	'0_ColumnDef': Expected0.ColumnDef<Features, Person>;
	'0_ColumnDefBase': Expected0.ColumnDefBase<Features, Person>;
	'0_ColumnDefBase_All': Expected0.ColumnDefBase_All<Features, Person>;
	'0_ColumnDefResolved': Expected0.ColumnDefResolved<Features, Person>;
	'0_ColumnDefTemplate': Expected0.ColumnDefTemplate<{ value: string }>;
	'0_ColumnDef_CellSelection': Expected0.ColumnDef_CellSelection;
	'0_ColumnDef_CellSpanning': Expected0.ColumnDef_CellSpanning<Features, Person>;
	'0_ColumnDef_ColumnFiltering': Expected0.ColumnDef_ColumnFiltering<Features, Person>;
	'0_ColumnDef_ColumnGrouping': Expected0.ColumnDef_ColumnGrouping<Features, Person>;
	'0_ColumnDef_ColumnPinning': Expected0.ColumnDef_ColumnPinning;
	'0_ColumnDef_ColumnResizing': Expected0.ColumnDef_ColumnResizing;
	'0_ColumnDef_ColumnSizing': Expected0.ColumnDef_ColumnSizing;
	'0_ColumnDef_ColumnVisibility': Expected0.ColumnDef_ColumnVisibility;
	'0_ColumnDef_FeatureMap': Expected0.ColumnDef_FeatureMap<Features, Person, string>;
	'0_ColumnDef_GlobalFiltering': Expected0.ColumnDef_GlobalFiltering;
	'0_ColumnDef_RowAggregation': Expected0.ColumnDef_RowAggregation<Features, Person>;
	'0_ColumnDef_RowSorting': Expected0.ColumnDef_RowSorting<Features, Person>;
	'0_ColumnDefaultOptions': Expected0.ColumnDefaultOptions;
	'0_ColumnFilter': Expected0.ColumnFilter;
	'0_ColumnFilterAutoRemoveTestFn': Expected0.ColumnFilterAutoRemoveTestFn<Features, Person>;
	'0_ColumnFiltersState': Expected0.ColumnFiltersState;
	'0_ColumnHelper': Expected0.ColumnHelper<Features, Person>;
	'0_ColumnIndexes': Expected0.ColumnIndexes;
	'0_ColumnMeta': Expected0.ColumnMeta<Features, Person>;
	'0_ColumnOffsets': Expected0.ColumnOffsets;
	'0_ColumnOffsetsByPosition': Expected0.ColumnOffsetsByPosition;
	'0_ColumnOrderDefaultOptions': Expected0.ColumnOrderDefaultOptions;
	'0_ColumnOrderState': Expected0.ColumnOrderState;
	'0_ColumnPinningDefaultOptions': Expected0.ColumnPinningDefaultOptions;
	'0_ColumnPinningPosition': Expected0.ColumnPinningPosition;
	'0_ColumnPinningState': Expected0.ColumnPinningState;
	'0_ColumnResizeDirection': Expected0.ColumnResizeDirection;
	'0_ColumnResizeMode': Expected0.ColumnResizeMode;
	'0_ColumnResizingDefaultOptions': Expected0.ColumnResizingDefaultOptions;
	'0_ColumnSizingDefaultOptions': Expected0.ColumnSizingDefaultOptions;
	'0_ColumnSizingState': Expected0.ColumnSizingState;
	'0_ColumnSort': Expected0.ColumnSort;
	'0_ColumnVisibilityState': Expected0.ColumnVisibilityState;
	'0_Column_Column': Expected0.Column_Column<Features, Person>;
	'0_Column_ColumnFaceting': Expected0.Column_ColumnFaceting<Features, Person>;
	'0_Column_ColumnFiltering': Expected0.Column_ColumnFiltering<Features, Person>;
	'0_Column_ColumnGrouping': Expected0.Column_ColumnGrouping;
	'0_Column_ColumnOrdering': Expected0.Column_ColumnOrdering;
	'0_Column_ColumnPinning': Expected0.Column_ColumnPinning;
	'0_Column_ColumnResizing': Expected0.Column_ColumnResizing;
	'0_Column_ColumnSizing': Expected0.Column_ColumnSizing;
	'0_Column_ColumnVisibility': Expected0.Column_ColumnVisibility;
	'0_Column_Core': Expected0.Column_Core<Features, Person>;
	'0_Column_CoreProperties': Expected0.Column_CoreProperties<Features, Person>;
	'0_Column_FeatureMap': Expected0.Column_FeatureMap<Features, Person>;
	'0_Column_GlobalFiltering': Expected0.Column_GlobalFiltering;
	'0_Column_RowAggregation': Expected0.Column_RowAggregation<Features, Person>;
	'0_Column_RowSorting': Expected0.Column_RowSorting<Features, Person>;
	'0_CoreFeatures': Expected0.CoreFeatures;
	'0_CreatedFilterFn': Expected0.CreatedFilterFn<Features, Person>;
	'0_CreatedSortFn': Expected0.CreatedSortFn<Features, Person>;
	'0_CustomAggregationFns': Expected0.CustomAggregationFns<Features, Person>;
	'0_CustomFilterFns': Expected0.CustomFilterFns<Features, Person>;
	'0_CustomSortFns': Expected0.CustomSortFns<Features, Person>;
	'0_DebugOptions': Expected0.DebugOptions<Features>;
	'0_DeepKeys': Expected0.DeepKeys<{ sample: string }>;
	'0_DeepValue': Expected0.DeepValue<{ sample: string }, 'sample'>;
	'0_DisplayColumnDef': Expected0.DisplayColumnDef<Features, Person>;
	'0_ExpandedState': Expected0.ExpandedState;
	'0_ExpandedStateList': Expected0.ExpandedStateList;
	'0_ExternalAtoms': Expected0.ExternalAtoms<Features>;
	'0_ExternalAtoms_All': Expected0.ExternalAtoms_All;
	'0_ExtractAggregationFnKeys': Expected0.ExtractAggregationFnKeys<Features>;
	'0_ExtractColumnMeta': Expected0.ExtractColumnMeta<Features, Person>;
	'0_ExtractFeatureMapTypes': Expected0.ExtractFeatureMapTypes<Features, { sample: string }>;
	'0_ExtractFilterFnKeys': Expected0.ExtractFilterFnKeys<Features>;
	'0_ExtractFilterMeta': Expected0.ExtractFilterMeta<Features>;
	'0_ExtractSortFnKeys': Expected0.ExtractSortFnKeys<Features>;
	'0_ExtractTableMeta': Expected0.ExtractTableMeta<Features, Person>;
	'0_FeatureSlotPrereqs': Expected0.FeatureSlotPrereqs;
	'0_FilterFn': Expected0.FilterFn<Features, Person>;
	'0_FilterFnDef': Expected0.FilterFnDef<Features, Person>;
	'0_FilterFnOption': Expected0.FilterFnOption<Features, Person>;
	'0_FilterFns': Expected0.FilterFns;
	'0_FilterMeta': Expected0.FilterMeta;
	'0_Getter': Expected0.Getter<string>;
	'0_GroupColumnDef': Expected0.GroupColumnDef<Features, Person>;
	'0_GroupingColumnMode': Expected0.GroupingColumnMode;
	'0_GroupingState': Expected0.GroupingState;
	'0_Header': Expected0.Header<Features, Person>;
	'0_HeaderContext': Expected0.HeaderContext<Features, Person>;
	'0_HeaderGroup': Expected0.HeaderGroup<Features, Person>;
	'0_HeaderGroup_Core': Expected0.HeaderGroup_Core<Features, Person>;
	'0_HeaderGroup_Header': Expected0.HeaderGroup_Header<Features, Person>;
	'0_Header_ColumnResizing': Expected0.Header_ColumnResizing;
	'0_Header_ColumnSizing': Expected0.Header_ColumnSizing;
	'0_Header_Core': Expected0.Header_Core<Features, Person>;
	'0_Header_CoreProperties': Expected0.Header_CoreProperties<Features, Person>;
	'0_Header_FeatureMap': Expected0.Header_FeatureMap;
	'0_Header_Header': Expected0.Header_Header<Features, Person>;
	'0_IdIdentifier': Expected0.IdIdentifier<Features, Person>;
	'0_IdentifiedColumnDef': Expected0.IdentifiedColumnDef<Features, Person>;
	'0_IsAny': Expected0.IsAny<{ sample: string }>;
	'0_NoInfer': Expected0.NoInfer<{ sample: string }>;
	'0_NonFeatureKeys': Expected0.NonFeatureKeys;
	'0_OnChangeFn': Expected0.OnChangeFn<{ sample: string }>;
	'0_PaginationDefaultOptions': Expected0.PaginationDefaultOptions;
	'0_PaginationState': Expected0.PaginationState;
	'0_PartialKeys': Expected0.PartialKeys<{ sample: string }, 'sample'>;
	'0_Plugins': Expected0.Plugins;
	'0_Prettify': Expected0.Prettify<{ sample: string }>;
	'0_PrototypeAPI': Expected0.PrototypeAPI<[string, number], { sample: string }>;
	'0_PrototypeAPIObject': Expected0.PrototypeAPIObject<[string, number], { sample: string }>;
	'0_RequiredKeys': Expected0.RequiredKeys<{ sample: string }, 'sample'>;
	'0_ResolvedAggregationFn': Expected0.ResolvedAggregationFn<Features, Person>;
	'0_ResolvedColumnFilter': Expected0.ResolvedColumnFilter<Features, Person>;
	'0_Row': Expected0.Row<Features, Person>;
	'0_RowData': Expected0.RowData;
	'0_RowModel': Expected0.RowModel<Features, Person>;
	'0_RowModelFns': Expected0.RowModelFns<Features, Person>;
	'0_RowModelFns_All': Expected0.RowModelFns_All<Features, Person>;
	'0_RowModelFns_ColumnFiltering': Expected0.RowModelFns_ColumnFiltering<Features, Person>;
	'0_RowModelFns_Core': Expected0.RowModelFns_Core;
	'0_RowModelFns_FeatureMap': Expected0.RowModelFns_FeatureMap<Features, Person>;
	'0_RowModelFns_RowAggregation': Expected0.RowModelFns_RowAggregation<Features, Person>;
	'0_RowModelFns_RowSorting': Expected0.RowModelFns_RowSorting<Features, Person>;
	'0_RowPinningDefaultOptions': Expected0.RowPinningDefaultOptions;
	'0_RowPinningPosition': Expected0.RowPinningPosition;
	'0_RowPinningState': Expected0.RowPinningState;
	'0_RowSelectionState': Expected0.RowSelectionState;
	'0_RowSpanContext': Expected0.RowSpanContext<Features, Person>;
	'0_Row_ColumnFiltering': Expected0.Row_ColumnFiltering<Features, Person>;
	'0_Row_ColumnGrouping': Expected0.Row_ColumnGrouping;
	'0_Row_ColumnPinning': Expected0.Row_ColumnPinning<Features, Person>;
	'0_Row_ColumnVisibility': Expected0.Row_ColumnVisibility<Features, Person>;
	'0_Row_Core': Expected0.Row_Core<Features, Person>;
	'0_Row_CoreProperties': Expected0.Row_CoreProperties<Features, Person>;
	'0_Row_FeatureMap': Expected0.Row_FeatureMap<Features, Person>;
	'0_Row_Row': Expected0.Row_Row<Features, Person>;
	'0_Row_RowAggregation': Expected0.Row_RowAggregation;
	'0_Row_RowExpanding': Expected0.Row_RowExpanding;
	'0_Row_RowPinning': Expected0.Row_RowPinning;
	'0_Row_RowSelection': Expected0.Row_RowSelection;
	'0_SelectCellRangeOptions': Expected0.SelectCellRangeOptions;
	'0_SortDirection': Expected0.SortDirection;
	'0_SortFn': Expected0.SortFn<Features, Person>;
	'0_SortFnDef': Expected0.SortFnDef<Features, Person>;
	'0_SortFnOption': Expected0.SortFnOption<Features, Person>;
	'0_SortFns': Expected0.SortFns;
	'0_SortingState': Expected0.SortingState;
	'0_StateSliceEqualityFn': Expected0.StateSliceEqualityFn<{ sample: string }>;
	'0_StockFeatures': Expected0.StockFeatures;
	'0_StringHeaderIdentifier': Expected0.StringHeaderIdentifier;
	'0_StringOrTemplateHeader': Expected0.StringOrTemplateHeader<Features, Person>;
	'0_Table': Expected0.Table<Features, Person>;
	'0_TableFeature': Expected0.TableFeature;
	'0_TableFeatures': Expected0.TableFeatures;
	'0_TableMeta': Expected0.TableMeta<Features, Person>;
	'0_TableOptions': Expected0.TableOptions<Features, Person>;
	'0_TableOptions_All': Expected0.TableOptions_All<Features, Person>;
	'0_TableOptions_Cell': Expected0.TableOptions_Cell;
	'0_TableOptions_CellSelection': Expected0.TableOptions_CellSelection<Features, Person>;
	'0_TableOptions_CellSpanning': Expected0.TableOptions_CellSpanning;
	'0_TableOptions_ColumnFiltering': Expected0.TableOptions_ColumnFiltering<Features, Person>;
	'0_TableOptions_ColumnGrouping': Expected0.TableOptions_ColumnGrouping;
	'0_TableOptions_ColumnOrdering': Expected0.TableOptions_ColumnOrdering;
	'0_TableOptions_ColumnPinning': Expected0.TableOptions_ColumnPinning;
	'0_TableOptions_ColumnResizing': Expected0.TableOptions_ColumnResizing;
	'0_TableOptions_ColumnSizing': Expected0.TableOptions_ColumnSizing;
	'0_TableOptions_ColumnVisibility': Expected0.TableOptions_ColumnVisibility;
	'0_TableOptions_Columns': Expected0.TableOptions_Columns<Features, Person>;
	'0_TableOptions_Core': Expected0.TableOptions_Core<Features, Person>;
	'0_TableOptions_FeatureMap': Expected0.TableOptions_FeatureMap<Features, Person>;
	'0_TableOptions_GlobalFiltering': Expected0.TableOptions_GlobalFiltering<Features, Person>;
	'0_TableOptions_RowAggregation': Expected0.TableOptions_RowAggregation;
	'0_TableOptions_RowExpanding': Expected0.TableOptions_RowExpanding<Features, Person>;
	'0_TableOptions_RowPagination': Expected0.TableOptions_RowPagination;
	'0_TableOptions_RowPinning': Expected0.TableOptions_RowPinning<Features, Person>;
	'0_TableOptions_RowSelection': Expected0.TableOptions_RowSelection<Features, Person>;
	'0_TableOptions_RowSorting': Expected0.TableOptions_RowSorting;
	'0_TableOptions_Rows': Expected0.TableOptions_Rows<Features, Person>;
	'0_TableOptions_Table': Expected0.TableOptions_Table<Features, Person>;
	'0_TableState': Expected0.TableState<Features>;
	'0_TableState_All': Expected0.TableState_All;
	'0_TableState_CellSelection': Expected0.TableState_CellSelection;
	'0_TableState_ColumnFiltering': Expected0.TableState_ColumnFiltering;
	'0_TableState_ColumnGrouping': Expected0.TableState_ColumnGrouping;
	'0_TableState_ColumnOrdering': Expected0.TableState_ColumnOrdering;
	'0_TableState_ColumnPinning': Expected0.TableState_ColumnPinning;
	'0_TableState_ColumnResizing': Expected0.TableState_ColumnResizing;
	'0_TableState_ColumnSizing': Expected0.TableState_ColumnSizing;
	'0_TableState_ColumnVisibility': Expected0.TableState_ColumnVisibility;
	'0_TableState_FeatureMap': Expected0.TableState_FeatureMap;
	'0_TableState_GlobalFiltering': Expected0.TableState_GlobalFiltering;
	'0_TableState_RowExpanding': Expected0.TableState_RowExpanding;
	'0_TableState_RowPagination': Expected0.TableState_RowPagination;
	'0_TableState_RowPinning': Expected0.TableState_RowPinning;
	'0_TableState_RowSelection': Expected0.TableState_RowSelection;
	'0_TableState_RowSorting': Expected0.TableState_RowSorting;
	'0_Table_CellSelection': Expected0.Table_CellSelection<Features, Person>;
	'0_Table_CellSpanning': Expected0.Table_CellSpanning<Features, Person>;
	'0_Table_ColumnFaceting': Expected0.Table_ColumnFaceting<Features, Person>;
	'0_Table_ColumnFiltering': Expected0.Table_ColumnFiltering;
	'0_Table_ColumnGrouping': Expected0.Table_ColumnGrouping<Features, Person>;
	'0_Table_ColumnOrdering': Expected0.Table_ColumnOrdering<Features, Person>;
	'0_Table_ColumnPinning': Expected0.Table_ColumnPinning<Features, Person>;
	'0_Table_ColumnResizing': Expected0.Table_ColumnResizing;
	'0_Table_ColumnSizing': Expected0.Table_ColumnSizing;
	'0_Table_ColumnVisibility': Expected0.Table_ColumnVisibility<Features, Person>;
	'0_Table_Columns': Expected0.Table_Columns<Features, Person>;
	'0_Table_Core': Expected0.Table_Core<Features, Person>;
	'0_Table_CoreProperties': Expected0.Table_CoreProperties<Features, Person>;
	'0_Table_FeatureMap': Expected0.Table_FeatureMap<Features, Person>;
	'0_Table_GlobalFiltering': Expected0.Table_GlobalFiltering<Features, Person>;
	'0_Table_Headers': Expected0.Table_Headers<Features, Person>;
	'0_Table_RowExpanding': Expected0.Table_RowExpanding<Features, Person>;
	'0_Table_RowModels': Expected0.Table_RowModels<Features, Person>;
	'0_Table_RowModels_Core': Expected0.Table_RowModels_Core<Features, Person>;
	'0_Table_RowModels_Expanded': Expected0.Table_RowModels_Expanded<Features, Person>;
	'0_Table_RowModels_Faceted': Expected0.Table_RowModels_Faceted<Features, Person>;
	'0_Table_RowModels_Filtered': Expected0.Table_RowModels_Filtered<Features, Person>;
	'0_Table_RowModels_Grouped': Expected0.Table_RowModels_Grouped<Features, Person>;
	'0_Table_RowModels_Paginated': Expected0.Table_RowModels_Paginated<Features, Person>;
	'0_Table_RowModels_Sorted': Expected0.Table_RowModels_Sorted<Features, Person>;
	'0_Table_RowPagination': Expected0.Table_RowPagination<Features, Person>;
	'0_Table_RowPinning': Expected0.Table_RowPinning<Features, Person>;
	'0_Table_RowSelection': Expected0.Table_RowSelection<Features, Person>;
	'0_Table_RowSorting': Expected0.Table_RowSorting<Features, Person>;
	'0_Table_Rows': Expected0.Table_Rows<Features, Person>;
	'0_Table_Table': Expected0.Table_Table<Features, Person>;
	'0_ToggleSelectedOptions': Expected0.ToggleSelectedOptions;
	'0_TransformDataValueFn': Expected0.TransformDataValueFn;
	'0_TransformFilterValueFn': Expected0.TransformFilterValueFn<Features, Person>;
	'0_UnionToIntersection': Expected0.UnionToIntersection<{ sample: string }>;
	'0_Updater': Expected0.Updater<{ sample: string }>;
	'0_ValidateFeatureSlots': Expected0.ValidateFeatureSlots<Features>;
	'0_VisibilityDefaultOptions': Expected0.VisibilityDefaultOptions;
	'0_aggregationFn_count': typeof Expected0.aggregationFn_count;
	'0_aggregationFn_extent': typeof Expected0.aggregationFn_extent;
	'0_aggregationFn_first': typeof Expected0.aggregationFn_first;
	'0_aggregationFn_last': typeof Expected0.aggregationFn_last;
	'0_aggregationFn_max': typeof Expected0.aggregationFn_max;
	'0_aggregationFn_mean': typeof Expected0.aggregationFn_mean;
	'0_aggregationFn_median': typeof Expected0.aggregationFn_median;
	'0_aggregationFn_min': typeof Expected0.aggregationFn_min;
	'0_aggregationFn_sum': typeof Expected0.aggregationFn_sum;
	'0_aggregationFn_unique': typeof Expected0.aggregationFn_unique;
	'0_aggregationFn_uniqueCount': typeof Expected0.aggregationFn_uniqueCount;
	'0_aggregationFns': typeof Expected0.aggregationFns;
	'0_assignPrototypeAPIs': typeof Expected0.assignPrototypeAPIs;
	'0_assignTableAPIs': typeof Expected0.assignTableAPIs;
	'0_buildHeaderGroups': typeof Expected0.buildHeaderGroups;
	'0_callMemoOrStaticFn': typeof Expected0.callMemoOrStaticFn;
	'0_cellSelectionFeature': typeof Expected0.cellSelectionFeature;
	'0_cellSpanningFeature': typeof Expected0.cellSpanningFeature;
	'0_cloneState': typeof Expected0.cloneState;
	'0_columnFacetingFeature': typeof Expected0.columnFacetingFeature;
	'0_columnFilteringFeature': typeof Expected0.columnFilteringFeature;
	'0_columnGroupingFeature': typeof Expected0.columnGroupingFeature;
	'0_columnOrderingFeature': typeof Expected0.columnOrderingFeature;
	'0_columnPinningFeature': typeof Expected0.columnPinningFeature;
	'0_columnResizingFeature': typeof Expected0.columnResizingFeature;
	'0_columnResizingState': Expected0.columnResizingState;
	'0_columnSizingFeature': typeof Expected0.columnSizingFeature;
	'0_columnVisibilityFeature': typeof Expected0.columnVisibilityFeature;
	'0_constructAggregationFn': typeof Expected0.constructAggregationFn;
	'0_constructCell': typeof Expected0.constructCell;
	'0_constructColumn': typeof Expected0.constructColumn;
	'0_constructFilterFn': typeof Expected0.constructFilterFn;
	'0_constructHeader': typeof Expected0.constructHeader;
	'0_constructRow': typeof Expected0.constructRow;
	'0_constructSortFn': typeof Expected0.constructSortFn;
	'0_constructTable': typeof Expected0.constructTable;
	'0_copyInstancePropertiesWithoutMemos': typeof Expected0.copyInstancePropertiesWithoutMemos;
	'0_coreCellsFeature': typeof Expected0.coreCellsFeature;
	'0_coreColumnsFeature': typeof Expected0.coreColumnsFeature;
	'0_coreFeatures': typeof Expected0.coreFeatures;
	'0_coreHeadersFeature': typeof Expected0.coreHeadersFeature;
	'0_coreRowModelsFeature': typeof Expected0.coreRowModelsFeature;
	'0_coreRowsFeature': typeof Expected0.coreRowsFeature;
	'0_coreTablesFeature': typeof Expected0.coreTablesFeature;
	'0_createColumnHelper': typeof Expected0.createColumnHelper;
	'0_createCoreRowModel': typeof Expected0.createCoreRowModel;
	'0_createExpandedRowModel': typeof Expected0.createExpandedRowModel;
	'0_createFacetedMinMaxValues': typeof Expected0.createFacetedMinMaxValues;
	'0_createFacetedRowModel': typeof Expected0.createFacetedRowModel;
	'0_createFacetedUniqueValues': typeof Expected0.createFacetedUniqueValues;
	'0_createFilteredRowModel': typeof Expected0.createFilteredRowModel;
	'0_createGroupedRowModel': typeof Expected0.createGroupedRowModel;
	'0_createPaginatedRowModel': typeof Expected0.createPaginatedRowModel;
	'0_createSortedRowModel': typeof Expected0.createSortedRowModel;
	'0_expandRows': typeof Expected0.expandRows;
	'0_filterFn_arrHas': typeof Expected0.filterFn_arrHas;
	'0_filterFn_arrIncludes': typeof Expected0.filterFn_arrIncludes;
	'0_filterFn_arrIncludesAll': typeof Expected0.filterFn_arrIncludesAll;
	'0_filterFn_arrIncludesSome': typeof Expected0.filterFn_arrIncludesSome;
	'0_filterFn_between': typeof Expected0.filterFn_between;
	'0_filterFn_betweenInclusive': typeof Expected0.filterFn_betweenInclusive;
	'0_filterFn_empty': typeof Expected0.filterFn_empty;
	'0_filterFn_endsWith': typeof Expected0.filterFn_endsWith;
	'0_filterFn_equals': typeof Expected0.filterFn_equals;
	'0_filterFn_equalsString': typeof Expected0.filterFn_equalsString;
	'0_filterFn_equalsStringSensitive': typeof Expected0.filterFn_equalsStringSensitive;
	'0_filterFn_greaterThan': typeof Expected0.filterFn_greaterThan;
	'0_filterFn_greaterThanOrEqualTo': typeof Expected0.filterFn_greaterThanOrEqualTo;
	'0_filterFn_inDateRange': typeof Expected0.filterFn_inDateRange;
	'0_filterFn_inNumberRange': typeof Expected0.filterFn_inNumberRange;
	'0_filterFn_includesString': typeof Expected0.filterFn_includesString;
	'0_filterFn_includesStringSensitive': typeof Expected0.filterFn_includesStringSensitive;
	'0_filterFn_lessThan': typeof Expected0.filterFn_lessThan;
	'0_filterFn_lessThanOrEqualTo': typeof Expected0.filterFn_lessThanOrEqualTo;
	'0_filterFn_notEmpty': typeof Expected0.filterFn_notEmpty;
	'0_filterFn_startsWith': typeof Expected0.filterFn_startsWith;
	'0_filterFn_weakEquals': typeof Expected0.filterFn_weakEquals;
	'0_filterFns': typeof Expected0.filterFns;
	'0_flattenBy': typeof Expected0.flattenBy;
	'0_functionalUpdate': typeof Expected0.functionalUpdate;
	'0_getFunctionNameInfo': typeof Expected0.getFunctionNameInfo;
	'0_getInitialTableState': typeof Expected0.getInitialTableState;
	'0_globalFilteringFeature': typeof Expected0.globalFilteringFeature;
	'0_hasOwn': typeof Expected0.hasOwn;
	'0_isFunction': typeof Expected0.isFunction;
	'0_makeObjectMap': typeof Expected0.makeObjectMap;
	'0_makeStateUpdater': typeof Expected0.makeStateUpdater;
	'0_memo': typeof Expected0.memo;
	'0_metaHelper': typeof Expected0.metaHelper;
	'0_reSplitAlphaNumeric': typeof Expected0.reSplitAlphaNumeric;
	'0_rowAggregationFeature': typeof Expected0.rowAggregationFeature;
	'0_rowExpandingFeature': typeof Expected0.rowExpandingFeature;
	'0_rowPaginationFeature': typeof Expected0.rowPaginationFeature;
	'0_rowPinningFeature': typeof Expected0.rowPinningFeature;
	'0_rowSelectionFeature': typeof Expected0.rowSelectionFeature;
	'0_rowSortingFeature': typeof Expected0.rowSortingFeature;
	'0_setStateSlice': typeof Expected0.setStateSlice;
	'0_skipFirstRun': typeof Expected0.skipFirstRun;
	'0_sortFn_alphanumeric': typeof Expected0.sortFn_alphanumeric;
	'0_sortFn_alphanumericCaseSensitive': typeof Expected0.sortFn_alphanumericCaseSensitive;
	'0_sortFn_basic': typeof Expected0.sortFn_basic;
	'0_sortFn_datetime': typeof Expected0.sortFn_datetime;
	'0_sortFn_text': typeof Expected0.sortFn_text;
	'0_sortFn_textCaseSensitive': typeof Expected0.sortFn_textCaseSensitive;
	'0_sortFns': typeof Expected0.sortFns;
	'0_stateSlicesEqual': typeof Expected0.stateSlicesEqual;
	'0_stockFeatures': typeof Expected0.stockFeatures;
	'0_tableFeatures': typeof Expected0.tableFeatures;
	'0_tableMemo': typeof Expected0.tableMemo;
	'0_tableOptions': typeof Expected0.tableOptions;
	'1_FlexRender': Parameters<typeof Expected1.FlexRender>['length'];
	'1_FlexRenderProps': keyof Expected1.FlexRenderProps<Features, Person>;
	'1_Renderable': keyof Expected1.Renderable<{ value: string }>;
	'1_flexRender': Parameters<typeof Expected1.flexRender>['length'];
	'2_FacetedMinMaxValuesFactory': Parameters<
		Expected2.FacetedMinMaxValuesFactory<Person>
	>['length'];
	'2_FacetedRowModelFactory': Parameters<Expected2.FacetedRowModelFactory<Person>>['length'];
	'2_FacetedUniqueValuesFactory': Parameters<
		Expected2.FacetedUniqueValuesFactory<Person>
	>['length'];
	'2_LegacyCell': keyof Expected2.LegacyCell<Person>;
	'2_LegacyColumn': keyof Expected2.LegacyColumn<Person>;
	'2_LegacyColumnDef': keyof Expected2.LegacyColumnDef<Person>;
	'2_LegacyFeatures': keyof Expected2.LegacyFeatures;
	'2_LegacyHeader': keyof Expected2.LegacyHeader<Person>;
	'2_LegacyHeaderGroup': keyof Expected2.LegacyHeaderGroup<Person>;
	'2_LegacyReactTable': keyof Expected2.LegacyReactTable<Person>;
	'2_LegacyRow': keyof Expected2.LegacyRow<Person>;
	'2_LegacyRowModelOptions': keyof Expected2.LegacyRowModelOptions<Person>;
	'2_LegacyTable': keyof Expected2.LegacyTable<Person>;
	'2_LegacyTableOptions': keyof Expected2.LegacyTableOptions<Person>;
	'2_RowModelFactory': Parameters<Expected2.RowModelFactory<Person>>['length'];
	'2_getCoreRowModel': Parameters<typeof Expected2.getCoreRowModel>['length'];
	'2_getExpandedRowModel': Parameters<typeof Expected2.getExpandedRowModel>['length'];
	'2_getFacetedMinMaxValues': Parameters<typeof Expected2.getFacetedMinMaxValues>['length'];
	'2_getFacetedRowModel': Parameters<typeof Expected2.getFacetedRowModel>['length'];
	'2_getFacetedUniqueValues': Parameters<typeof Expected2.getFacetedUniqueValues>['length'];
	'2_getFilteredRowModel': Parameters<typeof Expected2.getFilteredRowModel>['length'];
	'2_getGroupedRowModel': Parameters<typeof Expected2.getGroupedRowModel>['length'];
	'2_getPaginationRowModel': Parameters<typeof Expected2.getPaginationRowModel>['length'];
	'2_getSortedRowModel': Parameters<typeof Expected2.getSortedRowModel>['length'];
	'2_legacyCreateColumnHelper': Parameters<typeof Expected2.legacyCreateColumnHelper>['length'];
	'2_useLegacyTable': Parameters<typeof Expected2.useLegacyTable>['length'];
	'3_aggregateColumnValue': typeof Expected3.aggregateColumnValue;
	'3_cell_getCanSelect': typeof Expected3.cell_getCanSelect;
	'3_cell_getColSpan': typeof Expected3.cell_getColSpan;
	'3_cell_getContext': typeof Expected3.cell_getContext;
	'3_cell_getIsAggregated': typeof Expected3.cell_getIsAggregated;
	'3_cell_getIsCovered': typeof Expected3.cell_getIsCovered;
	'3_cell_getIsFocused': typeof Expected3.cell_getIsFocused;
	'3_cell_getIsGrouped': typeof Expected3.cell_getIsGrouped;
	'3_cell_getIsPlaceholder': typeof Expected3.cell_getIsPlaceholder;
	'3_cell_getIsSelected': typeof Expected3.cell_getIsSelected;
	'3_cell_getRowSpan': typeof Expected3.cell_getRowSpan;
	'3_cell_getSelectionEdges': typeof Expected3.cell_getSelectionEdges;
	'3_cell_getSelectionExtendHandler': typeof Expected3.cell_getSelectionExtendHandler;
	'3_cell_getSelectionStartHandler': typeof Expected3.cell_getSelectionStartHandler;
	'3_cell_getTabIndex': typeof Expected3.cell_getTabIndex;
	'3_cell_getValue': typeof Expected3.cell_getValue;
	'3_cell_renderValue': typeof Expected3.cell_renderValue;
	'3_column_clearSorting': typeof Expected3.column_clearSorting;
	'3_column_getAfter': typeof Expected3.column_getAfter;
	'3_column_getAggregationFns': typeof Expected3.column_getAggregationFns;
	'3_column_getAggregationValue': typeof Expected3.column_getAggregationValue;
	'3_column_getAutoAggregationFn': typeof Expected3.column_getAutoAggregationFn;
	'3_column_getAutoFilterFn': typeof Expected3.column_getAutoFilterFn;
	'3_column_getAutoSortDir': typeof Expected3.column_getAutoSortDir;
	'3_column_getAutoSortFn': typeof Expected3.column_getAutoSortFn;
	'3_column_getCanFilter': typeof Expected3.column_getCanFilter;
	'3_column_getCanGlobalFilter': typeof Expected3.column_getCanGlobalFilter;
	'3_column_getCanGroup': typeof Expected3.column_getCanGroup;
	'3_column_getCanHide': typeof Expected3.column_getCanHide;
	'3_column_getCanMultiSort': typeof Expected3.column_getCanMultiSort;
	'3_column_getCanPin': typeof Expected3.column_getCanPin;
	'3_column_getCanResize': typeof Expected3.column_getCanResize;
	'3_column_getCanSort': typeof Expected3.column_getCanSort;
	'3_column_getCanSpan': typeof Expected3.column_getCanSpan;
	'3_column_getFacetedMinMaxValues': typeof Expected3.column_getFacetedMinMaxValues;
	'3_column_getFacetedRowModel': typeof Expected3.column_getFacetedRowModel;
	'3_column_getFacetedUniqueValues': typeof Expected3.column_getFacetedUniqueValues;
	'3_column_getFilterFn': typeof Expected3.column_getFilterFn;
	'3_column_getFilterIndex': typeof Expected3.column_getFilterIndex;
	'3_column_getFilterValue': typeof Expected3.column_getFilterValue;
	'3_column_getFirstSortDir': typeof Expected3.column_getFirstSortDir;
	'3_column_getFlatColumns': typeof Expected3.column_getFlatColumns;
	'3_column_getGroupedIndex': typeof Expected3.column_getGroupedIndex;
	'3_column_getIndex': typeof Expected3.column_getIndex;
	'3_column_getIsFiltered': typeof Expected3.column_getIsFiltered;
	'3_column_getIsFirstColumn': typeof Expected3.column_getIsFirstColumn;
	'3_column_getIsGrouped': typeof Expected3.column_getIsGrouped;
	'3_column_getIsLastColumn': typeof Expected3.column_getIsLastColumn;
	'3_column_getIsPinned': typeof Expected3.column_getIsPinned;
	'3_column_getIsResizing': typeof Expected3.column_getIsResizing;
	'3_column_getIsSorted': typeof Expected3.column_getIsSorted;
	'3_column_getIsVisible': typeof Expected3.column_getIsVisible;
	'3_column_getLeafColumns': typeof Expected3.column_getLeafColumns;
	'3_column_getNextSortingOrder': typeof Expected3.column_getNextSortingOrder;
	'3_column_getPinnedIndex': typeof Expected3.column_getPinnedIndex;
	'3_column_getSize': typeof Expected3.column_getSize;
	'3_column_getSortFn': typeof Expected3.column_getSortFn;
	'3_column_getSortIndex': typeof Expected3.column_getSortIndex;
	'3_column_getStart': typeof Expected3.column_getStart;
	'3_column_getToggleGroupingHandler': typeof Expected3.column_getToggleGroupingHandler;
	'3_column_getToggleSortingHandler': typeof Expected3.column_getToggleSortingHandler;
	'3_column_getToggleVisibilityHandler': typeof Expected3.column_getToggleVisibilityHandler;
	'3_column_pin': typeof Expected3.column_pin;
	'3_column_resetSize': typeof Expected3.column_resetSize;
	'3_column_setFilterValue': typeof Expected3.column_setFilterValue;
	'3_column_toggleGrouping': typeof Expected3.column_toggleGrouping;
	'3_column_toggleSorting': typeof Expected3.column_toggleSorting;
	'3_column_toggleVisibility': typeof Expected3.column_toggleVisibility;
	'3_formatAggregatedCellValue': typeof Expected3.formatAggregatedCellValue;
	'3_getDefaultCellSelectionState': typeof Expected3.getDefaultCellSelectionState;
	'3_getDefaultColumnFiltersState': typeof Expected3.getDefaultColumnFiltersState;
	'3_getDefaultColumnOrderState': typeof Expected3.getDefaultColumnOrderState;
	'3_getDefaultColumnPinningState': typeof Expected3.getDefaultColumnPinningState;
	'3_getDefaultColumnResizingState': typeof Expected3.getDefaultColumnResizingState;
	'3_getDefaultColumnSizingColumnDef': typeof Expected3.getDefaultColumnSizingColumnDef;
	'3_getDefaultColumnSizingState': typeof Expected3.getDefaultColumnSizingState;
	'3_getDefaultColumnVisibilityState': typeof Expected3.getDefaultColumnVisibilityState;
	'3_getDefaultExpandedState': typeof Expected3.getDefaultExpandedState;
	'3_getDefaultGroupingState': typeof Expected3.getDefaultGroupingState;
	'3_getDefaultPaginationState': typeof Expected3.getDefaultPaginationState;
	'3_getDefaultRowPinningState': typeof Expected3.getDefaultRowPinningState;
	'3_getDefaultRowSelectionState': typeof Expected3.getDefaultRowSelectionState;
	'3_getDefaultSortingState': typeof Expected3.getDefaultSortingState;
	'3_header_getContext': typeof Expected3.header_getContext;
	'3_header_getLeafHeaders': typeof Expected3.header_getLeafHeaders;
	'3_header_getResizeHandler': typeof Expected3.header_getResizeHandler;
	'3_header_getSize': typeof Expected3.header_getSize;
	'3_header_getStart': typeof Expected3.header_getStart;
	'3_isRowSelected': typeof Expected3.isRowSelected;
	'3_isSubRowSelected': typeof Expected3.isSubRowSelected;
	'3_isTouchStartEvent': typeof Expected3.isTouchStartEvent;
	'3_normalizeAggregationRows': typeof Expected3.normalizeAggregationRows;
	'3_normalizeUniqueAggregationRows': typeof Expected3.normalizeUniqueAggregationRows;
	'3_orderColumns': typeof Expected3.orderColumns;
	'3_passiveEventSupported': typeof Expected3.passiveEventSupported;
	'3_row_getAllCells': typeof Expected3.row_getAllCells;
	'3_row_getAllCellsByColumnId': typeof Expected3.row_getAllCellsByColumnId;
	'3_row_getCanExpand': typeof Expected3.row_getCanExpand;
	'3_row_getCanMultiSelect': typeof Expected3.row_getCanMultiSelect;
	'3_row_getCanPin': typeof Expected3.row_getCanPin;
	'3_row_getCanSelect': typeof Expected3.row_getCanSelect;
	'3_row_getCanSelectSubRows': typeof Expected3.row_getCanSelectSubRows;
	'3_row_getCenterVisibleCells': typeof Expected3.row_getCenterVisibleCells;
	'3_row_getDisplayIndex': typeof Expected3.row_getDisplayIndex;
	'3_row_getEndVisibleCells': typeof Expected3.row_getEndVisibleCells;
	'3_row_getGroupingValue': typeof Expected3.row_getGroupingValue;
	'3_row_getIsAllParentsExpanded': typeof Expected3.row_getIsAllParentsExpanded;
	'3_row_getIsAllSubRowsSelected': typeof Expected3.row_getIsAllSubRowsSelected;
	'3_row_getIsExpanded': typeof Expected3.row_getIsExpanded;
	'3_row_getIsGrouped': typeof Expected3.row_getIsGrouped;
	'3_row_getIsPinned': typeof Expected3.row_getIsPinned;
	'3_row_getIsSelected': typeof Expected3.row_getIsSelected;
	'3_row_getIsSomeSelected': typeof Expected3.row_getIsSomeSelected;
	'3_row_getLeafRows': typeof Expected3.row_getLeafRows;
	'3_row_getParentRow': typeof Expected3.row_getParentRow;
	'3_row_getParentRows': typeof Expected3.row_getParentRows;
	'3_row_getPinnedIndex': typeof Expected3.row_getPinnedIndex;
	'3_row_getStartVisibleCells': typeof Expected3.row_getStartVisibleCells;
	'3_row_getToggleExpandedHandler': typeof Expected3.row_getToggleExpandedHandler;
	'3_row_getToggleSelectedHandler': typeof Expected3.row_getToggleSelectedHandler;
	'3_row_getUniqueValues': typeof Expected3.row_getUniqueValues;
	'3_row_getValue': typeof Expected3.row_getValue;
	'3_row_getVisibleCells': typeof Expected3.row_getVisibleCells;
	'3_row_getVisibleCellsByColumnId': typeof Expected3.row_getVisibleCellsByColumnId;
	'3_row_pin': typeof Expected3.row_pin;
	'3_row_renderValue': typeof Expected3.row_renderValue;
	'3_row_toggleExpanded': typeof Expected3.row_toggleExpanded;
	'3_row_toggleSelected': typeof Expected3.row_toggleSelected;
	'3_selectRowsFn': typeof Expected3.selectRowsFn;
	'3_shouldAutoRemoveFilter': typeof Expected3.shouldAutoRemoveFilter;
	'3_table_autoResetCellSelection': typeof Expected3.table_autoResetCellSelection;
	'3_table_autoResetExpanded': typeof Expected3.table_autoResetExpanded;
	'3_table_autoResetPageIndex': typeof Expected3.table_autoResetPageIndex;
	'3_table_autoResetSorting': typeof Expected3.table_autoResetSorting;
	'3_table_extendCellSelection': typeof Expected3.table_extendCellSelection;
	'3_table_firstPage': typeof Expected3.table_firstPage;
	'3_table_getAllColumns': typeof Expected3.table_getAllColumns;
	'3_table_getAllFlatColumns': typeof Expected3.table_getAllFlatColumns;
	'3_table_getAllFlatColumnsById': typeof Expected3.table_getAllFlatColumnsById;
	'3_table_getAllLeafColumns': typeof Expected3.table_getAllLeafColumns;
	'3_table_getAllLeafColumnsById': typeof Expected3.table_getAllLeafColumnsById;
	'3_table_getBottomRows': typeof Expected3.table_getBottomRows;
	'3_table_getCanLastPage': typeof Expected3.table_getCanLastPage;
	'3_table_getCanNextPage': typeof Expected3.table_getCanNextPage;
	'3_table_getCanPreviousPage': typeof Expected3.table_getCanPreviousPage;
	'3_table_getCanSomeRowsExpand': typeof Expected3.table_getCanSomeRowsExpand;
	'3_table_getCellSelectionBounds': typeof Expected3.table_getCellSelectionBounds;
	'3_table_getCellSelectionColumnIds': typeof Expected3.table_getCellSelectionColumnIds;
	'3_table_getCellSelectionColumnIndexes': typeof Expected3.table_getCellSelectionColumnIndexes;
	'3_table_getCellSelectionMergeBounds': typeof Expected3.table_getCellSelectionMergeBounds;
	'3_table_getCellSelectionRowIds': typeof Expected3.table_getCellSelectionRowIds;
	'3_table_getCellSpanIndex': typeof Expected3.table_getCellSpanIndex;
	'3_table_getCenterFlatHeaders': typeof Expected3.table_getCenterFlatHeaders;
	'3_table_getCenterFooterGroups': typeof Expected3.table_getCenterFooterGroups;
	'3_table_getCenterHeaderGroups': typeof Expected3.table_getCenterHeaderGroups;
	'3_table_getCenterLeafColumns': typeof Expected3.table_getCenterLeafColumns;
	'3_table_getCenterLeafHeaders': typeof Expected3.table_getCenterLeafHeaders;
	'3_table_getCenterRows': typeof Expected3.table_getCenterRows;
	'3_table_getCenterTotalSize': typeof Expected3.table_getCenterTotalSize;
	'3_table_getCenterVisibleLeafColumns': typeof Expected3.table_getCenterVisibleLeafColumns;
	'3_table_getColumn': typeof Expected3.table_getColumn;
	'3_table_getColumnIndexes': typeof Expected3.table_getColumnIndexes;
	'3_table_getColumnOffsets': typeof Expected3.table_getColumnOffsets;
	'3_table_getCoreRowModel': typeof Expected3.table_getCoreRowModel;
	'3_table_getDefaultColumnDef': typeof Expected3.table_getDefaultColumnDef;
	'3_table_getEndFlatHeaders': typeof Expected3.table_getEndFlatHeaders;
	'3_table_getEndFooterGroups': typeof Expected3.table_getEndFooterGroups;
	'3_table_getEndHeaderGroups': typeof Expected3.table_getEndHeaderGroups;
	'3_table_getEndLeafColumns': typeof Expected3.table_getEndLeafColumns;
	'3_table_getEndLeafHeaders': typeof Expected3.table_getEndLeafHeaders;
	'3_table_getEndTotalSize': typeof Expected3.table_getEndTotalSize;
	'3_table_getEndVisibleLeafColumns': typeof Expected3.table_getEndVisibleLeafColumns;
	'3_table_getExpandedDepth': typeof Expected3.table_getExpandedDepth;
	'3_table_getExpandedRowModel': typeof Expected3.table_getExpandedRowModel;
	'3_table_getFilteredRowModel': typeof Expected3.table_getFilteredRowModel;
	'3_table_getFilteredSelectedRowModel': typeof Expected3.table_getFilteredSelectedRowModel;
	'3_table_getFlatHeaders': typeof Expected3.table_getFlatHeaders;
	'3_table_getFocusedCell': typeof Expected3.table_getFocusedCell;
	'3_table_getFooterGroups': typeof Expected3.table_getFooterGroups;
	'3_table_getGlobalAutoFilterFn': typeof Expected3.table_getGlobalAutoFilterFn;
	'3_table_getGlobalFacetedMinMaxValues': typeof Expected3.table_getGlobalFacetedMinMaxValues;
	'3_table_getGlobalFacetedRowModel': typeof Expected3.table_getGlobalFacetedRowModel;
	'3_table_getGlobalFacetedUniqueValues': typeof Expected3.table_getGlobalFacetedUniqueValues;
	'3_table_getGlobalFilterFn': typeof Expected3.table_getGlobalFilterFn;
	'3_table_getGroupedRowModel': typeof Expected3.table_getGroupedRowModel;
	'3_table_getGroupedSelectedRowModel': typeof Expected3.table_getGroupedSelectedRowModel;
	'3_table_getHeaderGroups': typeof Expected3.table_getHeaderGroups;
	'3_table_getIsAllColumnsVisible': typeof Expected3.table_getIsAllColumnsVisible;
	'3_table_getIsAllPageRowsSelected': typeof Expected3.table_getIsAllPageRowsSelected;
	'3_table_getIsAllRowsExpanded': typeof Expected3.table_getIsAllRowsExpanded;
	'3_table_getIsAllRowsSelected': typeof Expected3.table_getIsAllRowsSelected;
	'3_table_getIsSomeColumnsPinned': typeof Expected3.table_getIsSomeColumnsPinned;
	'3_table_getIsSomeColumnsVisible': typeof Expected3.table_getIsSomeColumnsVisible;
	'3_table_getIsSomePageRowsSelected': typeof Expected3.table_getIsSomePageRowsSelected;
	'3_table_getIsSomeRowsExpanded': typeof Expected3.table_getIsSomeRowsExpanded;
	'3_table_getIsSomeRowsPinned': typeof Expected3.table_getIsSomeRowsPinned;
	'3_table_getIsSomeRowsSelected': typeof Expected3.table_getIsSomeRowsSelected;
	'3_table_getLeafHeaders': typeof Expected3.table_getLeafHeaders;
	'3_table_getMaxSubRowDepth': typeof Expected3.table_getMaxSubRowDepth;
	'3_table_getOrderColumnsFn': typeof Expected3.table_getOrderColumnsFn;
	'3_table_getPageCount': typeof Expected3.table_getPageCount;
	'3_table_getPageOptions': typeof Expected3.table_getPageOptions;
	'3_table_getPaginatedRowModel': typeof Expected3.table_getPaginatedRowModel;
	'3_table_getPinnedLeafColumns': typeof Expected3.table_getPinnedLeafColumns;
	'3_table_getPinnedVisibleLeafColumns': typeof Expected3.table_getPinnedVisibleLeafColumns;
	'3_table_getPreExpandedRowModel': typeof Expected3.table_getPreExpandedRowModel;
	'3_table_getPreFilteredRowModel': typeof Expected3.table_getPreFilteredRowModel;
	'3_table_getPreGroupedRowModel': typeof Expected3.table_getPreGroupedRowModel;
	'3_table_getPrePaginatedRowModel': typeof Expected3.table_getPrePaginatedRowModel;
	'3_table_getPreSelectedRowModel': typeof Expected3.table_getPreSelectedRowModel;
	'3_table_getPreSortedRowModel': typeof Expected3.table_getPreSortedRowModel;
	'3_table_getRow': typeof Expected3.table_getRow;
	'3_table_getRowCount': typeof Expected3.table_getRowCount;
	'3_table_getRowId': typeof Expected3.table_getRowId;
	'3_table_getRowModel': typeof Expected3.table_getRowModel;
	'3_table_getRowsInDisplayOrder': typeof Expected3.table_getRowsInDisplayOrder;
	'3_table_getSelectedCellCount': typeof Expected3.table_getSelectedCellCount;
	'3_table_getSelectedCellIds': typeof Expected3.table_getSelectedCellIds;
	'3_table_getSelectedCellRangesData': typeof Expected3.table_getSelectedCellRangesData;
	'3_table_getSelectedRowIds': typeof Expected3.table_getSelectedRowIds;
	'3_table_getSelectedRowModel': typeof Expected3.table_getSelectedRowModel;
	'3_table_getSortedRowModel': typeof Expected3.table_getSortedRowModel;
	'3_table_getStartFlatHeaders': typeof Expected3.table_getStartFlatHeaders;
	'3_table_getStartFooterGroups': typeof Expected3.table_getStartFooterGroups;
	'3_table_getStartHeaderGroups': typeof Expected3.table_getStartHeaderGroups;
	'3_table_getStartLeafColumns': typeof Expected3.table_getStartLeafColumns;
	'3_table_getStartLeafHeaders': typeof Expected3.table_getStartLeafHeaders;
	'3_table_getStartTotalSize': typeof Expected3.table_getStartTotalSize;
	'3_table_getStartVisibleLeafColumns': typeof Expected3.table_getStartVisibleLeafColumns;
	'3_table_getToggleAllColumnsVisibilityHandler': typeof Expected3.table_getToggleAllColumnsVisibilityHandler;
	'3_table_getToggleAllPageRowsSelectedHandler': typeof Expected3.table_getToggleAllPageRowsSelectedHandler;
	'3_table_getToggleAllRowsExpandedHandler': typeof Expected3.table_getToggleAllRowsExpandedHandler;
	'3_table_getToggleAllRowsSelectedHandler': typeof Expected3.table_getToggleAllRowsSelectedHandler;
	'3_table_getTopRows': typeof Expected3.table_getTopRows;
	'3_table_getTotalSize': typeof Expected3.table_getTotalSize;
	'3_table_getVisibleFlatColumns': typeof Expected3.table_getVisibleFlatColumns;
	'3_table_getVisibleLeafColumns': typeof Expected3.table_getVisibleLeafColumns;
	'3_table_lastPage': typeof Expected3.table_lastPage;
	'3_table_mergeOptions': typeof Expected3.table_mergeOptions;
	'3_table_moveCellSelection': typeof Expected3.table_moveCellSelection;
	'3_table_nextPage': typeof Expected3.table_nextPage;
	'3_table_previousPage': typeof Expected3.table_previousPage;
	'3_table_publishExternalState': typeof Expected3.table_publishExternalState;
	'3_table_reset': typeof Expected3.table_reset;
	'3_table_resetCellSelection': typeof Expected3.table_resetCellSelection;
	'3_table_resetColumnFilters': typeof Expected3.table_resetColumnFilters;
	'3_table_resetColumnOrder': typeof Expected3.table_resetColumnOrder;
	'3_table_resetColumnPinning': typeof Expected3.table_resetColumnPinning;
	'3_table_resetColumnSizing': typeof Expected3.table_resetColumnSizing;
	'3_table_resetColumnVisibility': typeof Expected3.table_resetColumnVisibility;
	'3_table_resetExpanded': typeof Expected3.table_resetExpanded;
	'3_table_resetGlobalFilter': typeof Expected3.table_resetGlobalFilter;
	'3_table_resetGrouping': typeof Expected3.table_resetGrouping;
	'3_table_resetHeaderSizeInfo': typeof Expected3.table_resetHeaderSizeInfo;
	'3_table_resetPageIndex': typeof Expected3.table_resetPageIndex;
	'3_table_resetPageSize': typeof Expected3.table_resetPageSize;
	'3_table_resetPagination': typeof Expected3.table_resetPagination;
	'3_table_resetRowPinning': typeof Expected3.table_resetRowPinning;
	'3_table_resetRowSelection': typeof Expected3.table_resetRowSelection;
	'3_table_resetSorting': typeof Expected3.table_resetSorting;
	'3_table_selectAllCells': typeof Expected3.table_selectAllCells;
	'3_table_selectCellRange': typeof Expected3.table_selectCellRange;
	'3_table_setCellSelection': typeof Expected3.table_setCellSelection;
	'3_table_setColumnFilters': typeof Expected3.table_setColumnFilters;
	'3_table_setColumnOrder': typeof Expected3.table_setColumnOrder;
	'3_table_setColumnPinning': typeof Expected3.table_setColumnPinning;
	'3_table_setColumnResizing': typeof Expected3.table_setColumnResizing;
	'3_table_setColumnSizing': typeof Expected3.table_setColumnSizing;
	'3_table_setColumnVisibility': typeof Expected3.table_setColumnVisibility;
	'3_table_setExpanded': typeof Expected3.table_setExpanded;
	'3_table_setFocusedCell': typeof Expected3.table_setFocusedCell;
	'3_table_setGlobalFilter': typeof Expected3.table_setGlobalFilter;
	'3_table_setGrouping': typeof Expected3.table_setGrouping;
	'3_table_setOptions': typeof Expected3.table_setOptions;
	'3_table_setPageIndex': typeof Expected3.table_setPageIndex;
	'3_table_setPageSize': typeof Expected3.table_setPageSize;
	'3_table_setPagination': typeof Expected3.table_setPagination;
	'3_table_setRowPinning': typeof Expected3.table_setRowPinning;
	'3_table_setRowSelection': typeof Expected3.table_setRowSelection;
	'3_table_setSorting': typeof Expected3.table_setSorting;
	'3_table_syncExternalStateToBaseAtoms': typeof Expected3.table_syncExternalStateToBaseAtoms;
	'3_table_toggleAllColumnsVisible': typeof Expected3.table_toggleAllColumnsVisible;
	'3_table_toggleAllPageRowsSelected': typeof Expected3.table_toggleAllPageRowsSelected;
	'3_table_toggleAllRowsExpanded': typeof Expected3.table_toggleAllRowsExpanded;
	'3_table_toggleAllRowsSelected': typeof Expected3.table_toggleAllRowsSelected;
	'4_TableState_WorkerRowModels': Expected4.TableState_WorkerRowModels;
	'4_TableWorker': Expected4.TableWorker;
	'4_TableWorkerBridge': Expected4.TableWorkerBridge;
	'4_TableWorkerConfig': Expected4.TableWorkerConfig<Features, Person>;
	'4_TableWorkerDataNode': Expected4.TableWorkerDataNode;
	'4_TableWorkerFilterData': Expected4.TableWorkerFilterData;
	'4_TableWorkerGroupNode': Expected4.TableWorkerGroupNode;
	'4_TableWorkerOptions': Expected4.TableWorkerOptions;
	'4_TableWorkerRequest': Expected4.TableWorkerRequest;
	'4_TableWorkerResponse': Expected4.TableWorkerResponse;
	'4_TableWorkerResult': Expected4.TableWorkerResult;
	'4_TableWorkerRowNode': Expected4.TableWorkerRowNode;
	'4_TableWorkerStage': Expected4.TableWorkerStage;
	'4_TableWorkerStagePayload': Expected4.TableWorkerStagePayload;
	'4_createTableWorker': typeof Expected4.createTableWorker;
	'4_createWorkerRowModel': typeof Expected4.createWorkerRowModel;
	'4_getTableWorkerBridge': typeof Expected4.getTableWorkerBridge;
	'4_initTableWorker': typeof Expected4.initTableWorker;
	'4_syncTableWorker': typeof Expected4.syncTableWorker;
	'4_tableWorkerPipeline': typeof Expected4.tableWorkerPipeline;
	'4_tableWorkerStageStateDeps': typeof Expected4.tableWorkerStageStateDeps;
	'4_workerRowModelsFeature': typeof Expected4.workerRowModelsFeature;
}
