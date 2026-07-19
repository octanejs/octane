// @octanejs/aria/components — the react-aria-components surface, ported onto octane.
// Exports mirror the upstream index (.react-spectrum/packages/react-aria-components/
// exports/index.ts), restricted to the Phase-4 foundation subset (collections engine,
// plumbing, and the non-collection components). Collection components (ListBox/Menu/
// Select/…), date/color families, and drag-and-drop arrive in later phases — see
// docs/aria-migration-plan.md.

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

// re-exports from the hooks surface, as upstream's index does
export { VisuallyHidden } from '../visually-hidden/VisuallyHidden';
export type { VisuallyHiddenProps } from '../visually-hidden/VisuallyHidden';
export type { Placement } from '../overlays/useOverlayPosition';
