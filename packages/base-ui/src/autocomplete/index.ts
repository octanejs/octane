export * as Autocomplete from './index.parts';

export type * from './root/AutocompleteRoot.tsrx';
export type * from './trigger/AutocompleteTrigger.tsrx';
export type * from './input-group/AutocompleteInputGroup.tsrx';
export type * from './item/AutocompleteItem.tsrx';
export type * from './value/AutocompleteValue.tsrx';

export type {
	AutocompleteSeparatorProps,
	AutocompleteSeparatorState,
} from './separator/AutocompleteSeparator.tsrx';

export type {
	ComboboxInputProps as AutocompleteInputProps,
	ComboboxInputState as AutocompleteInputState,
} from '../combobox/input/ComboboxInput.tsrx';
export type {
	ComboboxIconProps as AutocompleteIconProps,
	ComboboxIconState as AutocompleteIconState,
} from '../combobox/icon/ComboboxIcon.tsrx';
export type {
	ComboboxClearProps as AutocompleteClearProps,
	ComboboxClearState as AutocompleteClearState,
} from '../combobox/clear/ComboboxClear.tsrx';
export type {
	ComboboxPopupProps as AutocompletePopupProps,
	ComboboxPopupState as AutocompletePopupState,
} from '../combobox/popup/ComboboxPopup.tsrx';
export type {
	ComboboxPositionerProps as AutocompletePositionerProps,
	ComboboxPositionerState as AutocompletePositionerState,
} from '../combobox/positioner/ComboboxPositioner.tsrx';
export type {
	ComboboxListProps as AutocompleteListProps,
	ComboboxListState as AutocompleteListState,
} from '../combobox/list/ComboboxList.tsrx';
export type {
	ComboboxRowProps as AutocompleteRowProps,
	ComboboxRowState as AutocompleteRowState,
} from '../combobox/row/ComboboxRow.tsrx';
export type {
	ComboboxArrowProps as AutocompleteArrowProps,
	ComboboxArrowState as AutocompleteArrowState,
} from '../combobox/arrow/ComboboxArrow.tsrx';
export type {
	ComboboxBackdropProps as AutocompleteBackdropProps,
	ComboboxBackdropState as AutocompleteBackdropState,
} from '../combobox/backdrop/ComboboxBackdrop.tsrx';
export type {
	ComboboxPortalProps as AutocompletePortalProps,
	ComboboxPortalState as AutocompletePortalState,
} from '../combobox/portal/ComboboxPortal.tsrx';
export type {
	ComboboxGroupProps as AutocompleteGroupProps,
	ComboboxGroupState as AutocompleteGroupState,
} from '../combobox/group/ComboboxGroup.tsrx';
export type {
	ComboboxGroupLabelProps as AutocompleteGroupLabelProps,
	ComboboxGroupLabelState as AutocompleteGroupLabelState,
} from '../combobox/group-label/ComboboxGroupLabel.tsrx';
export type {
	ComboboxEmptyProps as AutocompleteEmptyProps,
	ComboboxEmptyState as AutocompleteEmptyState,
} from '../combobox/empty/ComboboxEmpty.tsrx';
export type {
	ComboboxStatusProps as AutocompleteStatusProps,
	ComboboxStatusState as AutocompleteStatusState,
} from '../combobox/status/ComboboxStatus.tsrx';
export type {
	ComboboxCollectionState as AutocompleteCollectionState,
	ComboboxCollectionProps as AutocompleteCollectionProps,
} from '../combobox/collection/ComboboxCollection.tsrx';

export type {
	Filter as AutocompleteFilter,
	UseFilterOptions as AutocompleteFilterOptions,
} from '../combobox/root/utils/useFilter';
