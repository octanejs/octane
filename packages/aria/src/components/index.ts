// @octanejs/aria/components — the react-aria-components surface, ported onto octane.
// Exports mirror the upstream index (.react-spectrum/packages/react-aria-components/
// exports/index.ts): the Phase-4 foundation (collections engine, plumbing,
// non-collection components) plus the Phase-5 collection components (Autocomplete,
// ListBox, Menu, Select, ComboBox, Tabs, TagGroup, GridList, Breadcrumbs, and the
// inert DragAndDrop context layer). Tree/Table, date/color families, and the
// drag-and-drop engine arrive in later phases — see docs/aria-migration-plan.md.

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
export type { Placement } from '../overlays/useOverlayPosition';
export { useFilter } from '../i18n/useFilter';
export type { Filter } from '../i18n/useFilter';
