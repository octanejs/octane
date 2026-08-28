import type {
	ActionMeta,
	GroupBase,
	InitialInputFocusedActionMeta,
	OnChangeValue,
	Options,
	OptionsOrGroups,
} from './types';

export type OptionContext = 'menu' | 'value';
export type GuidanceContext = 'menu' | 'input' | 'value';
export type AriaSelection<Option, IsMulti extends boolean> =
	| InitialInputFocusedActionMeta<Option, IsMulti>
	| (ActionMeta<Option> & {
			value: OnChangeValue<Option, IsMulti>;
			option?: Option;
			options?: Options<Option>;
	  });

export interface AriaGuidanceProps {
	'aria-label': string | undefined;
	context: GuidanceContext;
	isSearchable: boolean;
	isMulti: boolean;
	isDisabled: boolean | null;
	tabSelectsValue: boolean;
	isInitialFocus: boolean;
}

export type AriaOnChangeProps<Option, IsMulti extends boolean> = AriaSelection<Option, IsMulti> & {
	label: string;
	labels: string[];
	isDisabled: boolean | null;
};

export interface AriaOnFilterProps {
	inputValue: string;
	resultsMessage: string;
}

export interface AriaOnFocusProps<Option, Group extends GroupBase<Option>> {
	context: OptionContext;
	focused: Option;
	isDisabled: boolean;
	isSelected: boolean;
	label: string;
	options: OptionsOrGroups<Option, Group>;
	selectValue: Options<Option>;
	isAppleDevice: boolean;
}

export type AriaGuidance = (props: AriaGuidanceProps) => string;
export type AriaOnChange<Option, IsMulti extends boolean> = (
	props: AriaOnChangeProps<Option, IsMulti>,
) => string;
export type AriaOnFilter = (props: AriaOnFilterProps) => string;
export type AriaOnFocus<Option, Group extends GroupBase<Option> = GroupBase<Option>> = (
	props: AriaOnFocusProps<Option, Group>,
) => string;

export interface AriaLiveMessages<
	Option,
	IsMulti extends boolean,
	Group extends GroupBase<Option>,
> {
	guidance?: (props: AriaGuidanceProps) => string;
	onChange?: (props: AriaOnChangeProps<Option, IsMulti>) => string;
	onFilter?: (props: AriaOnFilterProps) => string;
	onFocus?: (props: AriaOnFocusProps<Option, Group>) => string;
}
