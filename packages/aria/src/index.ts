// @octanejs/aria — the `react-aria` surface, ported onto octane. Exports mirror the
// upstream monopackage index (.react-spectrum/packages/react-aria/exports/index.ts) and
// grow area-by-area with the migration plan (docs/aria-migration-plan.md).

// button
export { useButton } from './button/useButton';
export { useToggleButton } from './button/useToggleButton';
export { useToggleButtonGroup, useToggleButtonGroupItem } from './button/useToggleButtonGroup';

// checkbox
export { useCheckbox } from './checkbox/useCheckbox';
export { useCheckboxGroup } from './checkbox/useCheckboxGroup';
export { useCheckboxGroupItem } from './checkbox/useCheckboxGroupItem';

// disclosure
export { useDisclosure } from './disclosure/useDisclosure';

// focus
export { FocusRing } from './focus/FocusRing';
export { FocusScope, useFocusManager } from './focus/FocusScope';
export { useFocusRing } from './focus/useFocusRing';

// i18n
export { I18nProvider, useLocale } from './i18n/I18nProvider';
export { isRTL } from './i18n/utils';
export { useCollator } from './i18n/useCollator';
export { useDateFormatter } from './i18n/useDateFormatter';
export { useFilter } from './i18n/useFilter';
export {
	useLocalizedStringFormatter,
	useLocalizedStringDictionary,
} from './i18n/useLocalizedStringFormatter';
export { useNumberFormatter } from './i18n/useNumberFormatter';
export { useListFormatter } from './i18n/useListFormatter';

// label
export { useField } from './label/useField';
export { useLabel } from './label/useLabel';

// link
export { useLink } from './link/useLink';

// meter
export { useMeter } from './meter/useMeter';

// progress
export { useProgressBar } from './progress/useProgressBar';

// radio
export { useRadio } from './radio/useRadio';
export { useRadioGroup } from './radio/useRadioGroup';

// searchfield
export { useSearchField } from './searchfield/useSearchField';

// separator
export { useSeparator } from './separator/useSeparator';

// switch
export { useSwitch } from './switch/useSwitch';

// textfield
export { useTextField } from './textfield/useTextField';

// toolbar
export { useToolbar } from './toolbar/useToolbar';

// visually-hidden
export { VisuallyHidden, useVisuallyHidden } from './visually-hidden/VisuallyHidden';

// interactions
export { useFocus } from './interactions/useFocus';
export { useFocusVisible } from './interactions/useFocusVisible';
export { useFocusWithin } from './interactions/useFocusWithin';
export { useHover } from './interactions/useHover';
export { useInteractOutside } from './interactions/useInteractOutside';
export { useKeyboard } from './interactions/useKeyboard';
export { useMove } from './interactions/useMove';
export { usePress } from './interactions/usePress';
export { useLongPress } from './interactions/useLongPress';
export { useFocusable, Focusable } from './interactions/useFocusable';
export { Pressable } from './interactions/Pressable';

// utils
export { chain } from './utils/chain';
export { mergeProps } from './utils/mergeProps';
export { mergeRefs } from './utils/mergeRefs';
export { RouterProvider } from './utils/openLink';
export { useId } from './utils/useId';
export { useObjectRef } from './utils/useObjectRef';

// ssr
export { SSRProvider, useIsSSR } from './ssr/SSRProvider';

// types — upstream re-exports the React-free event/prop types from @react-types/shared;
// the event-handler prop types come from the ported modules, where React's synthetic
// event types became native ones.
export type { FocusProps, FocusResult } from './interactions/useFocus';
export type { FocusVisibleProps, FocusVisibleResult } from './interactions/useFocusVisible';
export type { FocusWithinProps, FocusWithinResult } from './interactions/useFocusWithin';
export type { HoverProps, HoverResult } from './interactions/useHover';
export type { InteractOutsideProps } from './interactions/useInteractOutside';
export type { KeyboardProps, KeyboardResult } from './interactions/useKeyboard';
export type { LongPressProps, LongPressResult } from './interactions/useLongPress';
export type { MoveResult } from './interactions/useMove';
export type { PressHookProps, PressProps, PressResult } from './interactions/usePress';
export type { PressableProps } from './interactions/Pressable';
export type { FocusableAria, FocusableOptions, FocusableProps } from './interactions/useFocusable';
export type {
	MoveEvents,
	PressEvent,
	PressEvents,
	LongPressEvent,
	MoveStartEvent,
	MoveMoveEvent,
	MoveEndEvent,
} from '@react-types/shared';
export type { SSRProviderProps } from './ssr/SSRProvider';
export type { AriaButtonOptions, AriaButtonProps, ButtonAria } from './button/useButton';
export type { AriaToggleButtonProps, ToggleButtonAria } from './button/useToggleButton';
export type {
	AriaToggleButtonGroupProps,
	AriaToggleButtonGroupItemProps,
	ToggleButtonGroupAria,
} from './button/useToggleButtonGroup';
export type { AriaCheckboxProps, CheckboxAria, CheckboxProps } from './checkbox/useCheckbox';
export type { AriaCheckboxGroupProps, CheckboxGroupAria } from './checkbox/useCheckboxGroup';
export type { AriaCheckboxGroupItemProps } from './checkbox/useCheckboxGroupItem';
export type { AriaDisclosureProps, DisclosureAria } from './disclosure/useDisclosure';
export type { FocusManager, FocusManagerOptions, FocusScopeProps } from './focus/FocusScope';
export type { FocusRingProps } from './focus/FocusRing';
export type { AriaFocusRingProps, FocusRingAria } from './focus/useFocusRing';
export type { I18nProviderProps, Locale } from './i18n/I18nProvider';
export type { DateFormatterOptions } from './i18n/useDateFormatter';
export type { Filter } from './i18n/useFilter';
export type { AriaFieldProps, FieldAria } from './label/useField';
export type { LabelAria, LabelAriaProps } from './label/useLabel';
export type { AriaLinkOptions, LinkAria } from './link/useLink';
export type { AriaMeterProps, MeterAria } from './meter/useMeter';
export type { AriaProgressBarProps, ProgressBarAria } from './progress/useProgressBar';
export type { AriaRadioProps, RadioAria } from './radio/useRadio';
export type { AriaRadioGroupProps, RadioGroupAria } from './radio/useRadioGroup';
export type { AriaSearchFieldProps, SearchFieldAria } from './searchfield/useSearchField';
export type { SeparatorAria, SeparatorProps } from './separator/useSeparator';
export type { AriaSwitchProps, SwitchAria, SwitchProps } from './switch/useSwitch';
export type {
	AriaTextFieldOptions,
	AriaTextFieldProps,
	TextFieldAria,
	TextFieldProps,
} from './textfield/useTextField';
export type { AriaToolbarProps, ToolbarAria } from './toolbar/useToolbar';
export type { VisuallyHiddenAria, VisuallyHiddenProps } from './visually-hidden/VisuallyHidden';

// listbox — mirrors the @react-aria/listbox shim surface.
export { useListBox } from './listbox/useListBox';
export { useOption } from './listbox/useOption';
export { useListBoxSection } from './listbox/useListBoxSection';
export { listData, getItemId } from './listbox/utils';

// menu — mirrors the @react-aria/menu shim surface.
export { useMenu } from './menu/useMenu';
export { useMenuItem } from './menu/useMenuItem';
export { useMenuSection } from './menu/useMenuSection';
export { useMenuTrigger } from './menu/useMenuTrigger';
export { useSubmenuTrigger } from './menu/useSubmenuTrigger';

// tabs — mirrors the @react-aria/tabs shim surface.
export { useTab } from './tabs/useTab';
export { useTabList } from './tabs/useTabList';
export { useTabPanel } from './tabs/useTabPanel';

// slider — mirrors the @react-aria/slider shim surface.
export { useSlider } from './slider/useSlider';
export { useSliderThumb } from './slider/useSliderThumb';

// numberfield — mirrors the @react-aria/numberfield shim surface.
export { useNumberField } from './numberfield/useNumberField';

// gridlist — mirrors the @react-aria/gridlist shim surface.
export { useGridList } from './gridlist/useGridList';
export { useGridListItem } from './gridlist/useGridListItem';
export { useGridListSelectionCheckbox } from './gridlist/useGridListSelectionCheckbox';
export { useGridListSection } from './gridlist/useGridListSection';

// tag — mirrors the @react-aria/tag shim surface.
export { useTag } from './tag/useTag';
export { useTagGroup } from './tag/useTagGroup';

// breadcrumbs — mirrors the @react-aria/breadcrumbs shim surface.
export { useBreadcrumbItem } from './breadcrumbs/useBreadcrumbItem';
export { useBreadcrumbs } from './breadcrumbs/useBreadcrumbs';

// listbox/menu/tabs/slider/numberfield/gridlist/tag/breadcrumbs types.
export type {
	ListBoxProps,
	AriaListBoxPropsBase,
	AriaListBoxProps,
	AriaListBoxOptions,
	ListBoxAria,
} from './listbox/useListBox';
export type { AriaOptionProps, OptionAria } from './listbox/useOption';
export type { AriaListBoxSectionProps, ListBoxSectionAria } from './listbox/useListBoxSection';
export type { AriaMenuTriggerProps, MenuTriggerAria } from './menu/useMenuTrigger';
export type { MenuProps, AriaMenuProps, AriaMenuOptions, MenuAria } from './menu/useMenu';
export type { AriaMenuItemProps, MenuItemAria } from './menu/useMenuItem';
export type { AriaMenuSectionProps, MenuSectionAria } from './menu/useMenuSection';
export type { AriaSubmenuTriggerProps, SubmenuTriggerAria } from './menu/useSubmenuTrigger';
export type { AriaTabProps, TabAria } from './tabs/useTab';
export type { AriaTabPanelProps, TabPanelAria } from './tabs/useTabPanel';
export type { AriaTabListProps, AriaTabListOptions, TabListAria } from './tabs/useTabList';
export type { AriaSliderProps, SliderAria } from './slider/useSlider';
export type {
	SliderThumbProps,
	AriaSliderThumbProps,
	AriaSliderThumbOptions,
	SliderThumbAria,
} from './slider/useSliderThumb';
export type { AriaNumberFieldProps, NumberFieldAria } from './numberfield/useNumberField';
export type {
	AriaGridListOptions,
	AriaGridListProps,
	GridListAria,
	GridListProps,
} from './gridlist/useGridList';
export type { AriaGridListItemOptions, GridListItemAria } from './gridlist/useGridListItem';
export type { AriaGridListSectionProps, GridListSectionAria } from './gridlist/useGridListSection';
export type {
	AriaGridSelectionCheckboxProps,
	GridSelectionCheckboxAria,
} from './grid/useGridSelectionCheckbox';
export type { AriaTagProps, TagAria } from './tag/useTag';
export type { TagGroupAria, AriaTagGroupProps, AriaTagGroupOptions } from './tag/useTagGroup';
export type {
	BreadcrumbItemProps,
	AriaBreadcrumbItemProps,
	BreadcrumbItemAria,
} from './breadcrumbs/useBreadcrumbItem';
export type { AriaBreadcrumbsProps, BreadcrumbsAria } from './breadcrumbs/useBreadcrumbs';
export type { Orientation } from '@react-types/shared';

// selection — mirrors the @react-aria/selection shim surface.
export { useSelectableCollection } from './selection/useSelectableCollection';
export { useSelectableItem } from './selection/useSelectableItem';
export { useSelectableList } from './selection/useSelectableList';
export { useTypeSelect } from './selection/useTypeSelect';
export { ListKeyboardDelegate } from './selection/ListKeyboardDelegate';
export { DOMLayoutDelegate } from './selection/DOMLayoutDelegate';
export type { AriaSelectableCollectionOptions } from './selection/useSelectableCollection';
export type { SelectableItemAria, SelectableItemOptions } from './selection/useSelectableItem';
export type { AriaSelectableListOptions } from './selection/useSelectableList';
export type { AriaTypeSelectOptions, TypeSelectAria } from './selection/useTypeSelect';

// overlays — mirrors the @react-aria/overlays shim surface.
export { useOverlay } from './overlays/useOverlay';
export { useOverlayPosition } from './overlays/useOverlayPosition';
export { useOverlayTrigger } from './overlays/useOverlayTrigger';
export { usePreventScroll } from './overlays/usePreventScroll';
export { ariaHideOutside } from './overlays/ariaHideOutside';
export { DismissButton } from './overlays/DismissButton';
export { Overlay, useOverlayFocusContain } from './overlays/Overlay';
export {
	ModalProvider,
	useModalProvider,
	OverlayProvider,
	OverlayContainer,
	useModal,
} from './overlays/useModal';
export { usePopover } from './overlays/usePopover';
export { useModalOverlay } from './overlays/useModalOverlay';
export { UNSAFE_PortalProvider, useUNSAFE_PortalContext } from './overlays/PortalProvider';
export type {
	AriaPositionProps,
	PositionAria,
	Placement,
	PlacementAxis,
	PositionProps,
	Axis,
	SizeAxis,
} from './overlays/useOverlayPosition';
export type { AriaOverlayProps, OverlayAria } from './overlays/useOverlay';
export type { OverlayTriggerAria, OverlayTriggerProps } from './overlays/useOverlayTrigger';
export type {
	AriaModalOptions,
	ModalAria,
	ModalProviderAria,
	ModalProviderProps,
	OverlayContainerProps,
} from './overlays/useModal';
export type { DismissButtonProps } from './overlays/DismissButton';
export type { OverlayProps } from './overlays/Overlay';
export type { AriaPopoverProps, PopoverAria } from './overlays/usePopover';
export type { AriaModalOverlayProps, ModalOverlayAria } from './overlays/useModalOverlay';
export type { PortalProviderProps, PortalProviderContextValue } from './overlays/PortalProvider';

// dialog — mirrors the @react-aria/dialog shim surface.
export { useDialog } from './dialog/useDialog';
export type { AriaDialogProps, DialogAria } from './dialog/useDialog';

// tooltip — mirrors the @react-aria/tooltip shim surface.
export { useTooltip } from './tooltip/useTooltip';
export { useTooltipTrigger } from './tooltip/useTooltipTrigger';
export type { TooltipProps, AriaTooltipProps, TooltipAria } from './tooltip/useTooltip';
export type { TooltipTriggerAria } from './tooltip/useTooltipTrigger';
export type { TooltipTriggerProps } from './stately/tooltip/useTooltipTriggerState';

// select — mirrors the @react-aria/select shim surface.
export { useSelect } from './select/useSelect';
export { useHiddenSelect, HiddenSelect } from './select/HiddenSelect';
export type { AriaSelectProps, AriaSelectOptions, SelectAria } from './select/useSelect';
export type {
	AriaHiddenSelectProps,
	AriaHiddenSelectOptions,
	HiddenSelectProps,
	HiddenSelectAria,
} from './select/HiddenSelect';

// combobox — mirrors the @react-aria/combobox shim surface.
export { useComboBox } from './combobox/useComboBox';
export type { AriaComboBoxProps, AriaComboBoxOptions, ComboBoxAria } from './combobox/useComboBox';

// tree — mirrors the @react-aria/tree shim surface.
export { useTree } from './tree/useTree';
export { useTreeItem } from './tree/useTreeItem';
export type { AriaTreeOptions, AriaTreeProps, TreeAria, TreeProps } from './tree/useTree';
export type { AriaTreeItemOptions, TreeItemAria } from './tree/useTreeItem';

// table — mirrors the @react-aria/table shim surface.
export { useTable } from './table/useTable';
export { useTableColumnHeader } from './table/useTableColumnHeader';
export { useTableRow } from './table/useTableRow';
export { useTableHeaderRow } from './table/useTableHeaderRow';
export { useTableCell } from './table/useTableCell';
export {
	useTableSelectionCheckbox,
	useTableSelectAllCheckbox,
} from './table/useTableSelectionCheckbox';
export { useTableColumnResize } from './table/useTableColumnResize';
export { useTableRowGroup } from './table/useTableRowGroup';
export type { AriaTableProps } from './table/useTable';
export type {
	AriaTableColumnHeaderProps,
	TableColumnHeaderAria,
} from './table/useTableColumnHeader';
export type { TableRowAria } from './table/useTableRow';
export type { TableHeaderRowAria } from './table/useTableHeaderRow';
export type { AriaTableCellProps, TableCellAria } from './table/useTableCell';
export type {
	AriaTableSelectionCheckboxProps,
	TableSelectionCheckboxAria,
	TableSelectAllCheckboxAria,
} from './table/useTableSelectionCheckbox';
export type {
	AriaTableColumnResizeProps,
	TableColumnResizeAria,
} from './table/useTableColumnResize';
export type { GridAria, GridProps } from './grid/useGrid';
export type { GridRowAria, GridRowProps } from './grid/useGridRow';
