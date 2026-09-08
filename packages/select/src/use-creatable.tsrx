import { useCallback, useMemo } from 'octane';
import type { OctaneNode } from 'octane';

import {
	getOptionLabel as baseGetOptionLabel,
	getOptionValue as baseGetOptionValue,
} from './builtins';
import type {
	ActionMeta,
	GetOptionLabel,
	GetOptionValue,
	GroupBase,
	OnChangeValue,
	Options,
	OptionsOrGroups,
	PropsValue,
} from './types';
import { cleanValue, valueTernary } from './utils';
import type { PublicBaseSelectProps } from './select.tsrx';

export interface Accessors<Option> {
	getOptionValue: GetOptionValue<Option>;
	getOptionLabel: GetOptionLabel<Option>;
}

export interface CreatableAdditionalProps<Option, Group extends GroupBase<Option>> {
	allowCreateWhileLoading?: boolean;
	createOptionPosition?: 'first' | 'last';
	formatCreateLabel?: (inputValue: string) => OctaneNode;
	isValidNewOption?: (inputValue: string, value: Options<Option>, options: OptionsOrGroups<
		Option,
		Group
	>, accessors: Accessors<Option>) => boolean;
	getNewOptionData?: (inputValue: string, optionLabel: OctaneNode) => Option;
	onCreateOption?: (inputValue: string) => void;
}

export type CreatableBaseProps<Option, IsMulti extends boolean, Group extends GroupBase<Option>> =
	PublicBaseSelectProps<Option, IsMulti, Group> & CreatableAdditionalProps<Option, Group>;

function compareOption<Option>(inputValue: string, option: Option, accessors: Accessors<Option>) {
	const candidate = String(inputValue).toLowerCase();
	return String(accessors.getOptionValue(option)).toLowerCase() === candidate ||
		String(accessors.getOptionLabel(option)).toLowerCase() === candidate;
}

const builtins = {
	formatCreateLabel: (inputValue: string) => `Create "${inputValue}"`,
	isValidNewOption<Option, Group extends GroupBase<Option>>(
		inputValue: string,
		selectValue: Options<Option>,
		selectOptions: OptionsOrGroups<Option, Group>,
		accessors: Accessors<Option>,
	) {
		return !(!inputValue ||
			selectValue.some((option) => compareOption(inputValue, option, accessors)) ||
			selectOptions.some((option) => compareOption(inputValue, option as Option, accessors)));
	},
	getNewOptionData(inputValue: string, optionLabel: OctaneNode) {
		return { label: optionLabel, value: inputValue, __isNew__: true };
	},
};

export function useCreatable<Option, IsMulti extends boolean, Group extends GroupBase<Option>>(
	props: CreatableBaseProps<Option, IsMulti, Group>,
): CreatableBaseProps<Option, IsMulti, Group> {
	const {
		allowCreateWhileLoading = false,
		createOptionPosition = 'last',
		formatCreateLabel = builtins.formatCreateLabel,
		isValidNewOption = builtins.isValidNewOption,
		getNewOptionData = builtins.getNewOptionData as unknown as (inputValue: string, optionLabel: OctaneNode) => Option,
		onCreateOption,
		options: propsOptions = [],
		onChange: propsOnChange,
		...restSelectProps
	} = props;
	const {
		getOptionValue = baseGetOptionValue,
		getOptionLabel = baseGetOptionLabel,
		inputValue = '',
		isLoading,
		isMulti,
		value = null,
		name,
	} = restSelectProps;

	const newOption = useMemo(
		() => isValidNewOption(inputValue, cleanValue(value), propsOptions, {
			getOptionValue,
			getOptionLabel,
		}) ? getNewOptionData(inputValue, formatCreateLabel(inputValue)) : undefined,
		[
			formatCreateLabel,
			getNewOptionData,
			getOptionLabel,
			getOptionValue,
			inputValue,
			isValidNewOption,
			propsOptions,
			value,
		],
	);

	const options = useMemo(
		() => (allowCreateWhileLoading || !isLoading) && newOption
			? createOptionPosition === 'first'
				? [newOption, ...propsOptions]
				: [...propsOptions, newOption]
			: propsOptions,
		[allowCreateWhileLoading, createOptionPosition, isLoading, newOption, propsOptions],
	);

	const onChange = useCallback((
		newValue: OnChangeValue<Option, IsMulti>,
		actionMeta: ActionMeta<Option>,
	) => {
		if (actionMeta.action !== 'select-option') {
			propsOnChange?.(newValue, actionMeta);
			return;
		}
		const valueArray = Array.isArray(newValue) ? newValue : [newValue];
		if (valueArray[valueArray.length - 1] === newOption) {
			if (onCreateOption) onCreateOption(inputValue);
			else {
				const newOptionData = getNewOptionData(inputValue, inputValue);
				propsOnChange?.(
					valueTernary(
						isMulti,
						[...cleanValue(value), newOptionData],
						newOptionData,
					) as OnChangeValue<Option, IsMulti>,
					{ action: 'create-option', name, option: newOptionData },
				);
			}
			return;
		}
		propsOnChange?.(newValue, actionMeta);
	}, [
		getNewOptionData,
		inputValue,
		isMulti,
		name,
		newOption,
		onCreateOption,
		propsOnChange,
		value,
	]);

	return { ...restSelectProps, options, onChange } as CreatableBaseProps<Option, IsMulti, Group>;
}
