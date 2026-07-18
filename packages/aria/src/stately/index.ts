// @octanejs/aria/stately — the `react-stately` surface, ported onto octane. Exports mirror
// the upstream monopackage exports (.react-spectrum/packages/react-stately/exports/) and
// grow area-by-area with the migration plan (docs/aria-migration-plan.md).

// utils
export { useControlledState } from './utils/useControlledState';
export type { SetStateAction } from './utils/useControlledState';

// toggle
export { useToggleState } from './toggle/useToggleState';
export { useToggleGroupState } from './toggle/useToggleGroupState';
export type { ToggleProps, ToggleState, ToggleStateOptions } from './toggle/useToggleState';
export type { ToggleGroupProps, ToggleGroupState } from './toggle/useToggleGroupState';

// checkbox
export { useCheckboxGroupState } from './checkbox/useCheckboxGroupState';
export type { CheckboxGroupProps, CheckboxGroupState } from './checkbox/useCheckboxGroupState';

// radio
export { useRadioGroupState } from './radio/useRadioGroupState';
export type { RadioGroupProps, RadioGroupState } from './radio/useRadioGroupState';

// searchfield
export { useSearchFieldState } from './searchfield/useSearchFieldState';
export type { SearchFieldProps, SearchFieldState } from './searchfield/useSearchFieldState';

// disclosure
export { useDisclosureState } from './disclosure/useDisclosureState';
export { useDisclosureGroupState } from './disclosure/useDisclosureGroupState';
export type { DisclosureProps, DisclosureState } from './disclosure/useDisclosureState';
export type {
	DisclosureGroupProps,
	DisclosureGroupState,
} from './disclosure/useDisclosureGroupState';

// form — mirrors the @react-stately/form shim surface.
export {
	FormValidationContext,
	useFormValidationState,
	DEFAULT_VALIDATION_RESULT,
	VALID_VALIDITY_STATE,
	privateValidationStateProp,
	mergeValidation,
} from './form/useFormValidationState';
export type { FormValidationState } from './form/useFormValidationState';

// selection — mirrors the @react-stately/selection shim surface.
export { useMultipleSelectionState } from './selection/useMultipleSelectionState';
export { SelectionManager } from './selection/SelectionManager';
export { Selection } from './selection/Selection';
export type { MultipleSelectionStateProps } from './selection/useMultipleSelectionState';
export type {
	FocusState,
	SingleSelectionState,
	MultipleSelectionState,
	MultipleSelectionManager,
} from './selection/types';

// collections — mirrors the @react-stately/collections shim surface.
export { Item } from './collections/Item';
export { Section } from './collections/Section';
export { CollectionBuilder } from './collections/CollectionBuilder';
export { useCollection } from './collections/useCollection';
export { getItemCount } from './collections/getItemCount';
export {
	getChildNodes,
	getFirstItem,
	getLastItem,
	getNthItem,
	compareNodeOrder,
} from './collections/getChildNodes';
export type { PartialNode } from './collections/types';

// list
export { useListState, UNSTABLE_useFilteredListState } from './list/useListState';
export { useSingleSelectListState } from './list/useSingleSelectListState';
export { ListCollection } from './list/ListCollection';
export type { ListProps, ListState } from './list/useListState';
export type { SingleSelectListProps, SingleSelectListState } from './list/useSingleSelectListState';

// tree
export { useTreeState } from './tree/useTreeState';
export { TreeCollection } from './tree/TreeCollection';
export type { TreeProps, TreeState } from './tree/useTreeState';

// menu
export { useMenuTriggerState } from './menu/useMenuTriggerState';
export { useSubmenuTriggerState } from './menu/useSubmenuTriggerState';
export type { MenuTriggerState } from './menu/useMenuTriggerState';
export type { SubmenuTriggerState } from './menu/useSubmenuTriggerState';

// overlays
export { useOverlayTriggerState } from './overlays/useOverlayTriggerState';
export type { OverlayTriggerProps, OverlayTriggerState } from './overlays/useOverlayTriggerState';

// select
export { useSelectState } from './select/useSelectState';
export type { SelectState, SelectStateOptions } from './select/useSelectState';

// combobox
export { useComboBoxState } from './combobox/useComboBoxState';
export type { ComboBoxState, ComboBoxStateOptions } from './combobox/useComboBoxState';

// tabs
export { useTabListState } from './tabs/useTabListState';
export type { TabListProps, TabListState, TabListStateOptions } from './tabs/useTabListState';

// numberfield
export { useNumberFieldState } from './numberfield/useNumberFieldState';
export type { NumberFieldState, NumberFieldStateOptions } from './numberfield/useNumberFieldState';

// slider
export { useSliderState } from './slider/useSliderState';
export type { SliderState, SliderStateOptions } from './slider/useSliderState';
