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
