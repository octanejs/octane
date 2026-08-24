// @octanejs/aria/components — the react-aria-components surface, ported onto octane.
// Exports mirror the pinned react-aria-components 1.19.0 index. Octane refs remain
// ordinary props and DOM handlers receive native events, but the public component,
// hook, state, layout, and type names stay aligned with upstream.

// plumbing
export {
	composeRenderProps,
	DEFAULT_SLOT,
	Provider,
	useContextProps,
	useRenderProps,
	useSlottedContext,
} from './utils';
export type { ContextValue, RenderProps, SlotProps, StyleRenderProps } from './utils';

// collections engine (mirrors the react-aria/CollectionBuilder + Collection exports)
export {
	createLeafComponent,
	createBranchComponent,
	CollectionBuilder,
	Collection,
} from '../collections/CollectionBuilder';
export type { CollectionProps } from '../collections/CollectionBuilder';
export { Section, CollectionRendererContext, DefaultCollectionRenderer } from './Collection';
export type { SectionProps, CollectionRenderer } from './Collection';

// components
export { Button, ButtonContext } from './Button';
export type { ButtonProps, ButtonRenderProps } from './Button';
export {
	Checkbox,
	CheckboxGroup,
	CheckboxField,
	CheckboxButton,
	CheckboxContext,
	CheckboxFieldContext,
	CheckboxGroupContext,
	CheckboxGroupStateContext,
} from './Checkbox';
export type {
	CheckboxGroupProps,
	CheckboxGroupRenderProps,
	CheckboxRenderProps,
	CheckboxProps,
	CheckboxFieldProps,
	CheckboxFieldRenderProps,
	CheckboxButtonProps,
	CheckboxButtonRenderProps,
} from './Checkbox';
export { DialogTrigger, Dialog, DialogContext, OverlayTriggerStateContext } from './Dialog';
export type { DialogProps, DialogTriggerProps, DialogRenderProps } from './Dialog';
export {
	Disclosure,
	DisclosureGroup,
	DisclosureGroupStateContext,
	DisclosurePanel,
	DisclosureStateContext,
	DisclosureContext,
} from './Disclosure';
export type {
	DisclosureProps,
	DisclosureRenderProps,
	DisclosurePanelProps,
	DisclosurePanelRenderProps,
	DisclosureGroupProps,
	DisclosureGroupRenderProps,
} from './Disclosure';
export { FieldError, FieldErrorContext } from './FieldError';
export type { FieldErrorProps, FieldErrorRenderProps } from './FieldError';
export { Form, FormContext } from './Form';
export type { FormProps } from './Form';
export { Group, GroupContext } from './Group';
export type { GroupProps, GroupRenderProps } from './Group';
export { Header, HeaderContext } from './Header';
export type { HeaderProps } from './Header';
export { Heading, HeadingContext } from './Heading';
export type { HeadingProps } from './Heading';
export { Input, InputContext } from './Input';
export type { InputProps, InputRenderProps } from './Input';
export { Keyboard, KeyboardContext } from './Keyboard';
export { Label, LabelContext } from './Label';
export type { LabelProps } from './Label';
export { Link, LinkContext } from './Link';
export type { LinkProps, LinkRenderProps } from './Link';
export { Meter, MeterContext } from './Meter';
export type { MeterProps, MeterRenderProps } from './Meter';
export { Modal, ModalOverlay, ModalContext } from './Modal';
export type { ModalOverlayProps, ModalRenderProps } from './Modal';
export { NumberField, NumberFieldContext, NumberFieldStateContext } from './NumberField';
export type { NumberFieldProps, NumberFieldRenderProps } from './NumberField';
export { OverlayArrow } from './OverlayArrow';
export type { OverlayArrowProps, OverlayArrowRenderProps } from './OverlayArrow';
export { Popover, PopoverContext } from './Popover';
export type { PopoverProps, PopoverRenderProps } from './Popover';
export { ProgressBar, ProgressBarContext } from './ProgressBar';
export type { ProgressBarProps, ProgressBarRenderProps } from './ProgressBar';
export {
	RadioGroup,
	Radio,
	RadioField,
	RadioButton,
	RadioGroupContext,
	RadioContext,
	RadioFieldContext,
	RadioGroupStateContext,
} from './RadioGroup';
export type {
	RadioGroupProps,
	RadioGroupRenderProps,
	RadioProps,
	RadioRenderProps,
	RadioFieldProps,
	RadioFieldRenderProps,
	RadioButtonProps,
	RadioButtonRenderProps,
} from './RadioGroup';
export { SearchField, SearchFieldContext } from './SearchField';
export type { SearchFieldProps, SearchFieldRenderProps } from './SearchField';
export { SelectionIndicator, SelectionIndicatorContext } from './SelectionIndicator';
export type { SelectionIndicatorProps } from './SelectionIndicator';
export { Separator, SeparatorContext } from './Separator';
export type { SeparatorProps } from './Separator';
export { SharedElementTransition, SharedElement } from './SharedElementTransition';
export type {
	SharedElementTransitionProps,
	SharedElementProps,
	SharedElementRenderProps,
} from './SharedElementTransition';
export {
	Slider,
	SliderOutput,
	SliderTrack,
	SliderThumb,
	SliderFill,
	SliderContext,
	SliderOutputContext,
	SliderTrackContext,
	SliderFillContext,
	SliderStateContext,
} from './Slider';
export type {
	SliderOutputProps,
	SliderProps,
	SliderRenderProps,
	SliderThumbProps,
	SliderTrackProps,
	SliderTrackRenderProps,
	SliderFillProps,
	SliderFillRenderProps,
	SliderThumbRenderProps,
} from './Slider';
export { Switch, SwitchField, SwitchButton, SwitchContext, SwitchFieldContext } from './Switch';
export type {
	SwitchProps,
	SwitchRenderProps,
	SwitchFieldProps,
	SwitchFieldRenderProps,
	SwitchButtonProps,
	SwitchButtonRenderProps,
} from './Switch';
export { Text, TextContext } from './Text';
export type { TextProps } from './Text';
export { TextArea, TextAreaContext } from './TextArea';
export type { TextAreaProps } from './TextArea';
export { TextField, TextFieldContext } from './TextField';
export type { TextFieldProps, TextFieldRenderProps } from './TextField';
export { ToggleButton, ToggleButtonContext } from './ToggleButton';
export type { ToggleButtonProps, ToggleButtonRenderProps } from './ToggleButton';
export {
	ToggleButtonGroup,
	ToggleButtonGroupContext,
	ToggleGroupStateContext,
} from './ToggleButtonGroup';
export type { ToggleButtonGroupProps, ToggleButtonGroupRenderProps } from './ToggleButtonGroup';
export { Toolbar, ToolbarContext } from './Toolbar';
export type { ToolbarProps, ToolbarRenderProps } from './Toolbar';
export { TooltipTrigger, Tooltip, TooltipTriggerStateContext, TooltipContext } from './Tooltip';
export type { TooltipProps, TooltipRenderProps, TooltipTriggerComponentProps } from './Tooltip';

// collection components (Phase 5)
export {
	Autocomplete,
	AutocompleteContext,
	AutocompleteStateContext,
	SelectableCollectionContext,
	FieldInputContext,
} from './Autocomplete';
export type { AutocompleteProps, SelectableCollectionContextValue } from './Autocomplete';
export {
	ListBoxLoadMoreItem,
	ListBox,
	ListBoxItem,
	ListBoxSection,
	ListBoxContext,
	ListStateContext,
} from './ListBox';
export type {
	ListBoxProps,
	ListBoxRenderProps,
	ListBoxItemProps,
	ListBoxItemRenderProps,
	ListBoxSectionProps,
	ListBoxLoadMoreItemProps,
} from './ListBox';
export {
	Menu,
	MenuItem,
	MenuTrigger,
	MenuSection,
	MenuContext,
	MenuStateContext,
	RootMenuTriggerStateContext,
	SubmenuTrigger,
} from './Menu';
export type {
	MenuProps,
	MenuItemProps,
	MenuItemRenderProps,
	MenuTriggerProps,
	SubmenuTriggerProps,
	MenuSectionProps,
} from './Menu';
export {
	Select,
	SelectValue,
	SelectContext,
	SelectValueContext,
	SelectStateContext,
} from './Select';
export type {
	SelectProps,
	SelectValueProps,
	SelectValueRenderProps,
	SelectRenderProps,
} from './Select';
export {
	ComboBox,
	ComboBoxValue,
	ComboBoxContext,
	ComboBoxStateContext,
	ComboBoxValueContext,
} from './ComboBox';
export type {
	ComboBoxProps,
	ComboBoxRenderProps,
	ComboBoxValueProps,
	ComboBoxValueRenderProps,
} from './ComboBox';
export { Tabs, TabList, TabPanels, TabPanel, Tab, TabsContext, TabListStateContext } from './Tabs';
export type {
	TabListProps,
	TabListRenderProps,
	TabPanelsProps,
	TabPanelProps,
	TabPanelRenderProps,
	TabProps,
	TabsProps,
	TabRenderProps,
	TabsRenderProps,
} from './Tabs';
export { TagGroup, TagGroupContext, TagList, TagListContext, Tag } from './TagGroup';
export type {
	TagGroupProps,
	TagListProps,
	TagListRenderProps,
	TagProps,
	TagRenderProps,
} from './TagGroup';
export {
	GridListLoadMoreItem,
	GridList,
	GridListItem,
	GridListContext,
	GridListHeader,
	GridListHeaderContext,
	GridListSection,
} from './GridList';
export type {
	GridListProps,
	GridListRenderProps,
	GridListItemProps,
	GridListItemRenderProps,
	GridListLoadMoreItemProps,
	GridListSectionProps,
} from './GridList';
export { Breadcrumbs, BreadcrumbsContext, Breadcrumb } from './Breadcrumbs';
export type { BreadcrumbsProps, BreadcrumbProps, BreadcrumbRenderProps } from './Breadcrumbs';
export { DropIndicator, DropIndicatorContext, DragAndDropContext } from './DragAndDrop';
export type { DropIndicatorProps, DropIndicatorRenderProps } from './DragAndDrop';
export { useDragAndDrop } from './useDragAndDrop';
export type { DragAndDropHooks, DragAndDropOptions } from './useDragAndDrop';

// re-exports from the hooks surface, as upstream's index does
export { VisuallyHidden } from '../visually-hidden/VisuallyHidden';
export type { VisuallyHiddenProps } from '../visually-hidden/VisuallyHidden';
// Upstream RAC's Focusable.d.ts is literally `export { Focusable } from
// 'react-aria/Focusable'` — the same component the hooks surface already
// exports, published under both entry points.
export { Focusable } from '../interactions/useFocusable';
export type { Placement } from '../overlays/useOverlayPosition';
export { useFilter } from '../i18n/useFilter';
export type { Filter } from '../i18n/useFilter';

// tree + table (Tree/Table phase)
export {
	TreeLoadMoreItem,
	Tree,
	TreeItem,
	TreeContext,
	TreeItemContent,
	TreeHeader,
	TreeSection,
	TreeStateContext,
} from './Tree';
export type {
	TreeProps,
	TreeRenderProps,
	TreeEmptyStateRenderProps,
	TreeItemProps,
	TreeItemRenderProps,
	TreeItemContentProps,
	TreeItemContentRenderProps,
	TreeLoadMoreItemProps,
	TreeLoadMoreItemRenderProps,
} from './Tree';
export {
	TableLoadMoreItem,
	Table,
	Row,
	Cell,
	Column,
	ColumnResizer,
	TableHeader,
	TableBody,
	TableContext,
	ResizableTableContainer,
	useTableOptions,
	TableStateContext,
	TableColumnResizeStateContext,
	TableFooter,
} from './Table';

// calendar and date/time
export {
	Calendar,
	CalendarGrid,
	CalendarGridHeader,
	CalendarGridBody,
	CalendarHeaderCell,
	CalendarCell,
	RangeCalendar,
	CalendarContext,
	RangeCalendarContext,
	CalendarStateContext,
	RangeCalendarStateContext,
	CalendarMonthPicker,
	CalendarYearPicker,
	CalendarHeading,
} from './Calendar';
export type {
	CalendarCellProps,
	CalendarProps,
	CalendarRenderProps,
	CalendarGridProps,
	CalendarGridHeaderProps,
	CalendarGridBodyProps,
	CalendarHeaderCellProps,
	CalendarCellRenderProps,
	RangeCalendarProps,
	RangeCalendarRenderProps,
	CalendarMonthPickerProps,
	CalendarYearPickerProps,
	CalendarHeadingProps,
} from './Calendar';
export {
	DateField,
	DateInput,
	DateSegment,
	TimeField,
	DateFieldContext,
	TimeFieldContext,
	DateFieldStateContext,
	TimeFieldStateContext,
} from './DateField';
export type {
	DateFieldProps,
	DateFieldRenderProps,
	DateInputProps,
	DateInputRenderProps,
	DateSegmentProps,
	DateSegmentRenderProps,
	TimeFieldProps,
} from './DateField';
export {
	DatePicker,
	DateRangePicker,
	DatePickerContext,
	DateRangePickerContext,
	DatePickerStateContext,
	DateRangePickerStateContext,
} from './DatePicker';
export type {
	DatePickerProps,
	DatePickerRenderProps,
	DateRangePickerProps,
	DateRangePickerRenderProps,
} from './DatePicker';

// color
export { ColorArea, ColorAreaContext, ColorAreaStateContext } from './ColorArea';
export type { ColorAreaProps, ColorAreaRenderProps } from './ColorArea';
export { ColorField, ColorFieldContext, ColorFieldStateContext } from './ColorField';
export type { ColorFieldProps, ColorFieldRenderProps } from './ColorField';
export { ColorPicker, ColorPickerContext, ColorPickerStateContext } from './ColorPicker';
export type { ColorPickerProps, ColorPickerRenderProps } from './ColorPicker';
export { ColorSlider, ColorSliderContext, ColorSliderStateContext } from './ColorSlider';
export type { ColorSliderProps, ColorSliderRenderProps } from './ColorSlider';
export { ColorSwatch, ColorSwatchContext } from './ColorSwatch';
export type { ColorSwatchProps, ColorSwatchRenderProps } from './ColorSwatch';
export {
	ColorSwatchPicker,
	ColorSwatchPickerItem,
	ColorSwatchPickerContext,
} from './ColorSwatchPicker';
export type {
	ColorSwatchPickerProps,
	ColorSwatchPickerRenderProps,
	ColorSwatchPickerItemProps,
	ColorSwatchPickerItemRenderProps,
} from './ColorSwatchPicker';
export { ColorThumb } from './ColorThumb';
export type { ColorThumbProps, ColorThumbRenderProps } from './ColorThumb';
export {
	ColorWheel,
	ColorWheelContext,
	ColorWheelTrack,
	ColorWheelTrackContext,
	ColorWheelStateContext,
} from './ColorWheel';
export type {
	ColorWheelProps,
	ColorWheelRenderProps,
	ColorWheelTrackProps,
	ColorWheelTrackRenderProps,
} from './ColorWheel';

// drag and drop, files, toasts, and virtualized layouts
export { DropZone, DropZoneContext } from './DropZone';
export type { DropZoneProps, DropZoneRenderProps } from './DropZone';
export { FileTrigger } from './FileTrigger';
export type { FileTriggerProps } from './FileTrigger';
export {
	UNSTABLE_Toast,
	UNSTABLE_ToastList,
	UNSTABLE_ToastRegion,
	UNSTABLE_ToastContent,
	UNSTABLE_ToastStateContext,
} from './Toast';
export type {
	ToastRegionProps,
	ToastListProps,
	ToastRegionRenderProps,
	ToastProps,
	ToastRenderProps,
} from './Toast';
export { Virtualizer } from './Virtualizer';
export type { VirtualizerProps } from './Virtualizer';
export { GridLayout } from './GridLayout';
export { TableLayout } from './TableLayout';

// upstream runtime re-exports
export { useDrag } from '../dnd/useDrag';
export { useDrop } from '../dnd/useDrop';
export {
	DIRECTORY_DRAG_TYPE,
	isDirectoryDropItem,
	isFileDropItem,
	isTextDropItem,
} from '../dnd/utils';
export { SSRProvider } from '../ssr/SSRProvider';
export { RouterProvider } from '../utils/openLink';
export { I18nProvider, useLocale } from '../i18n/I18nProvider';
export { isRTL } from '../i18n/utils';
export { Pressable } from '../interactions/Pressable';
export { FormValidationContext } from '../stately/form/useFormValidationState';
export { parseColor, getColorChannels } from '../stately/color/Color';
export { ToastQueue as UNSTABLE_ToastQueue } from '../stately/toast/useToastState';
export { useListData } from '../stately/data/useListData';
export { useTreeData } from '../stately/data/useTreeData';
export { useAsyncList } from '../stately/data/useAsyncList';
export { ListLayout } from '../stately/layout/ListLayout';
export { WaterfallLayout } from '../stately/layout/WaterfallLayout';
export { Layout } from '../stately/virtualizer/Layout';
export { LayoutInfo } from '../stately/virtualizer/LayoutInfo';
export { Size } from '../stately/virtualizer/Size';
export { Rect } from '../stately/virtualizer/Rect';
export { Point } from '../stately/virtualizer/Point';

// upstream public state and shared types
export type { DragOptions, DragResult } from '../dnd/useDrag';
export type { I18nProviderProps, Locale } from '../i18n/I18nProvider';
export type {
	DateValue,
	DateFieldState,
} from '../upstream-exports/react-stately/useDateFieldState';
export type {
	DateRange,
	DateRangePickerState,
} from '../upstream-exports/react-stately/useDateRangePickerState';
export type {
	TimeValue,
	TimeFieldState,
} from '../upstream-exports/react-stately/useTimeFieldState';
export type { DatePickerState } from '../stately/datepicker/useDatePickerState';
export type { CalendarState } from '../upstream-exports/react-stately/useCalendarState';
export type { RangeCalendarState } from '../upstream-exports/react-stately/useRangeCalendarState';
export type {
	ColorSpace,
	ColorChannel,
	Color,
	ColorFormat,
	ColorAxes,
	ColorChannelRange,
} from '../upstream-exports/react-stately/Color';
export type { ColorAreaState } from '../stately/color/useColorAreaState';
export type { ColorFieldState } from '../stately/color/useColorFieldState';
export type { ColorPickerState } from '../stately/color/useColorPickerState';
export type { ColorSliderState } from '../stately/color/useColorSliderState';
export type { ColorWheelState } from '../stately/color/useColorWheelState';
export type { QueuedToast, ToastOptions, ToastState } from '../stately/toast/useToastState';
export type { ListOptions as ListDataOptions, ListData } from '../stately/data/useListData';
export type { TreeOptions as TreeDataOptions, TreeData } from '../stately/data/useTreeData';
export type {
	AsyncListOptions,
	AsyncListData,
	AsyncListLoadFunction,
	AsyncListLoadOptions,
	AsyncListStateUpdate,
} from '../stately/data/useAsyncList';
export type { ListLayoutOptions } from '../stately/layout/ListLayout';
export type { GridLayoutOptions } from '../stately/layout/GridLayout';
export type { TableLayoutProps } from '../stately/layout/TableLayout';
export type { WaterfallLayoutOptions } from '../stately/layout/WaterfallLayout';
export type { ComboBoxState } from '../stately/combobox/useComboBoxState';
export type { DisclosureState } from '../stately/disclosure/useDisclosureState';
export type { DisclosureGroupState } from '../stately/disclosure/useDisclosureGroupState';
export type { ListState } from '../stately/list/useListState';
export type { NumberFieldState } from '../stately/numberfield/useNumberFieldState';
export type { OverlayTriggerState } from '../stately/overlays/useOverlayTriggerState';
export type { RadioGroupState } from '../stately/radio/useRadioGroupState';
export type { RootMenuTriggerState } from '../stately/menu/useMenuTriggerState';
export type { SearchFieldState } from '../stately/searchfield/useSearchFieldState';
export type { SelectState } from '../stately/select/useSelectState';
export type { SliderState } from '../stately/slider/useSliderState';
export type { TableState } from '../stately/table/useTableState';
export type { TabListState } from '../stately/tabs/useTabListState';
export type { ToggleGroupState } from '../stately/toggle/useToggleGroupState';
export type { ToggleState } from '../stately/toggle/useToggleState';
export type { TooltipTriggerState } from '../stately/tooltip/useTooltipTriggerState';
export type { TreeState } from '../stately/tree/useTreeState';
export type { CheckboxGroupState } from '../stately/checkbox/useCheckboxGroupState';
export type { AutocompleteState } from '../stately/autocomplete/useAutocompleteState';
export type {
	Key,
	Selection,
	SortDescriptor,
	SortDirection,
	SelectionMode,
	DirectoryDropItem,
	DraggableCollectionEndEvent,
	DraggableCollectionMoveEvent,
	DraggableCollectionStartEvent,
	DragPreviewRenderer,
	DragTypes,
	DropItem,
	DropOperation,
	DroppableCollectionDropEvent,
	DroppableCollectionEnterEvent,
	DroppableCollectionExitEvent,
	DroppableCollectionInsertDropEvent,
	DroppableCollectionMoveEvent,
	DroppableCollectionOnItemDropEvent,
	DroppableCollectionReorderEvent,
	DroppableCollectionRootDropEvent,
	DropPosition,
	DropTarget,
	FileDropItem,
	ItemDropTarget,
	RootDropTarget,
	TextDropItem,
	PressEvent,
	RangeValue,
	ValidationResult,
	RouterConfig,
} from '@react-types/shared';
export type {
	TableProps,
	TableRenderProps,
	TableHeaderProps,
	TableBodyProps,
	TableBodyRenderProps,
	ResizableTableContainerProps,
	ColumnProps,
	ColumnRenderProps,
	ColumnResizerProps,
	ColumnResizerRenderProps,
	RowProps,
	RowRenderProps,
	CellProps,
	CellRenderProps,
	TableLoadMoreItemProps,
	TableFooterProps,
} from './Table';
