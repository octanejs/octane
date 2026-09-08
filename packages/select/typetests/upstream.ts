import type {
	ActionMeta,
	AriaLiveMessages,
	ClassNamesConfig,
	CommonProps,
	CommonPropsAndClassName,
	ClearIndicatorProps,
	ControlProps,
	GroupBase,
	GroupProps,
	GetStyles,
	InputProps,
	MenuProps,
	MultiValueProps,
	OptionProps,
	OptionsOrGroups,
	Props,
	SelectComponentsConfig,
	SelectInstance,
	StylesConfig,
} from 'react-select';
import type { AsyncProps } from 'react-select/async';
import type { CreatableProps } from 'react-select/creatable';
import type { AsyncCreatableProps } from 'react-select/async-creatable';
import type BaseSelect from 'react-select/base';
import type makeAnimated from 'react-select/animated';

type Option = { label: string; value: string };
type Group = GroupBase<Option> & { category: string };

declare const rootProps: Props<Option, false, Group>;
declare const stateProps: Props<Option, true, Group>;
declare const asyncProps: AsyncProps<Option, false, Group>;
declare const creatableProps: CreatableProps<Option, true, Group>;
declare const asyncCreatableProps: AsyncCreatableProps<Option, false, Group>;
declare const instance: SelectInstance<Option, false, Group>;
declare const commonProps: CommonProps<Option, false, Group>;
declare const commonPropsWithClassName: CommonPropsAndClassName<Option, false, Group>;
declare const getStyles: GetStyles<Option, false, Group>;
declare const baseSelect: typeof BaseSelect;
declare const animatedFactory: typeof makeAnimated;

rootProps.getOptionLabel?.({ label: 'One', value: '1' });
stateProps.onChange?.([], { action: 'clear', removedValues: [] });
asyncProps.loadOptions?.('', () => {});
creatableProps.getNewOptionData?.('new', 'New');
asyncCreatableProps.loadOptions?.('', () => {});
instance.focus();
instance.blur();
instance.clearValue();
instance.selectOption({ label: 'One', value: '1' });
instance.setValue({ label: 'One', value: '1' }, 'select-option');
commonProps.selectOption({ label: 'One', value: '1' });
void commonPropsWithClassName.className;
void getStyles;
void baseSelect;
void animatedFactory;

const options: OptionsOrGroups<Option, Group> = [
	{ label: 'One', value: '1' },
	{ category: 'A', label: 'Group', options: [{ label: 'Two', value: '2' }] },
];
void options;

const components: SelectComponentsConfig<Option, false, Group> = {
	DropdownIndicator: null,
	IndicatorSeparator: null,
};
void components;

declare const componentProps:
	| ClearIndicatorProps<Option, false, Group>
	| ControlProps<Option, false, Group>
	| GroupProps<Option, false, Group>
	| InputProps<Option, false, Group>
	| MenuProps<Option, false, Group>
	| MultiValueProps<Option, false, Group>
	| OptionProps<Option, false, Group>;
void componentProps;

const styles: StylesConfig<Option, false, Group> = {};
const classNames: ClassNamesConfig<Option, false, Group> = {};
const aria: AriaLiveMessages<Option, false, Group> = {};
void styles;
void classNames;
void aria;

function action(meta: ActionMeta<Option>) {
	if (meta.action === 'select-option') return meta.option;
	if (meta.action === 'clear') return meta.removedValues;
	return meta.name;
}
void action;

// @ts-expect-error invalid action names stay rejected
const invalidAction: ActionMeta<Option> = { action: 'invalid' };
void invalidAction;
