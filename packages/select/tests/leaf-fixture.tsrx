import { classNames } from '../src/utils';
import {
	ClearIndicator,
	Control,
	CrossIcon,
	DownChevron,
	DropdownIndicator,
	Group,
	GroupHeading,
	IndicatorSeparator,
	IndicatorsContainer,
	Input,
	LoadingMessage,
	LoadingIndicator,
	Menu,
	MenuList,
	MultiValue,
	MultiValueContainer,
	MultiValueLabel,
	MultiValueRemove,
	NoOptionsMessage,
	Option,
	Placeholder,
	SelectContainer,
	SingleValue,
	ValueContainer,
} from '../src/components.tsrx';
import { defaultStyles } from '../src/default-styles';
import { defaultTheme } from '../src/theme';

export type LeafKind =
	| 'control'
	| 'clearIndicator'
	| 'cross'
	| 'down'
	| 'dropdownIndicator'
	| 'group'
	| 'groupHeading'
	| 'indicatorSeparator'
	| 'indicators'
	| 'input'
	| 'loadingMessage'
	| 'loadingIndicator'
	| 'menu'
	| 'menuList'
	| 'multiValue'
	| 'multiValueContainer'
	| 'multiValueRemove'
	| 'noOptionsMessage'
	| 'option'
	| 'placeholder'
	| 'selectContainer'
	| 'singleValue'
	| 'valueContainer';

export type LeafFixtureProps = {
	kind: LeafKind;
	unstyled?: boolean;
	disabled?: boolean;
	focused?: boolean;
	selected?: boolean;
	rtl?: boolean;
	multi?: boolean;
	hasValue?: boolean;
};

export function LeafFixture(props: LeafFixtureProps) @{
	const common = {
		className: 'consumer-slot',
		cx: (state: Record<string, boolean>, ...names: (string | undefined)[]) => classNames(
			'probe',
			state,
			...names.filter((name): name is string => name !== undefined),
		),
		getClassNames: (name: string) => `custom-${name}`,
		getStyles: (name: string, componentProps: unknown) => {
			const style = defaultStyles[name as keyof typeof defaultStyles] as (value: unknown, unstyled: boolean) => ReturnType<
				(typeof defaultStyles)['control']
			>;
			return style(componentProps, props.unstyled ?? false);
		},
		hasValue: props.hasValue ?? true,
		isMulti: props.multi ?? true,
		isRtl: props.rtl ?? false,
		selectProps: { controlShouldRenderValue: true },
		theme: defaultTheme,
	};
	const disabled = props.disabled ?? false;
	const focused = props.focused ?? true;

	if (props.kind === 'cross') return <CrossIcon size={14} data-probe="cross" />;
	if (props.kind === 'down') return <DownChevron data-probe="down" />;
	if (props.kind === 'clearIndicator') return <ClearIndicator
		{...common}
		innerProps={{ id: 'clear', 'data-inner': 'yes' }}
		isDisabled={disabled}
		isFocused={focused}
	/>;
	if (props.kind === 'dropdownIndicator') return <DropdownIndicator
		{...common}
		innerProps={{ id: 'dropdown', 'data-inner': 'yes' }}
		isDisabled={disabled}
		isFocused={focused}
	/>;
	if (props.kind === 'indicatorSeparator') return <IndicatorSeparator
		{...common}
		innerProps={{ id: 'separator', 'data-inner': 'yes' }}
		isDisabled={disabled}
		isFocused={focused}
	/>;
	if (props.kind === 'groupHeading') return <GroupHeading
		{...common}
		id="heading"
		data={{ label: 'Group', options: [] }}
		data-inner="yes"
	>Group label</GroupHeading>;
	if (props.kind === 'group') return <Group
		{...common}
		Heading={GroupHeading}
		headingProps={{ id: 'heading', data: { label: 'Group', options: [] } }}
		innerProps={{ id: 'group', 'data-inner': 'yes' }}
		label="Group label"
		data={{ label: 'Group', options: [] }}
		options={[]}
	>Group child</Group>;
	if (props.kind === 'multiValueContainer') return <MultiValueContainer
		data={{ label: 'One', value: '1' }}
		innerProps={{ id: 'multi-generic', 'data-inner': 'yes' }}
		selectProps={common.selectProps}
	>One</MultiValueContainer>;
	if (props.kind === 'multiValueRemove') return <MultiValueRemove
		data={{ label: 'One', value: '1' }}
		innerProps={{ id: 'multi-remove', 'data-inner': 'yes' }}
		selectProps={common.selectProps}
	/>;
	if (props.kind === 'multiValue') return <MultiValue
		{...common}
		components={{
			Container: MultiValueContainer,
			Label: MultiValueLabel,
			Remove: MultiValueRemove,
		}}
		data={{ label: 'One', value: '1' }}
		innerProps={{ id: 'multi', 'data-inner': 'yes' }}
		isFocused={focused}
		isDisabled={disabled}
		removeProps={{ id: 'remove', 'data-remove': 'yes' }}
		index={0}
	>One</MultiValue>;
	if (props.kind === 'input') return <Input
		{...common}
		innerRef={null}
		isDisabled={disabled}
		isHidden={!focused}
		inputClassName="consumer-input"
		id="input"
		name="choice"
		aria-label="Choice"
		readOnly={true}
		value="typed"
	/>;
	if (props.kind === 'menu') return <Menu
		{...common}
		innerRef={null}
		innerProps={{ id: 'menu', 'data-inner': 'yes' }}
		isLoading={false}
		placement="bottom"
		minMenuHeight={140}
		maxMenuHeight={300}
		menuPlacement="bottom"
		menuPosition="absolute"
		menuShouldScrollIntoView={true}
	>Menu child</Menu>;
	if (props.kind === 'menuList') return <MenuList
		{...common}
		innerRef={null}
		innerProps={{ id: 'menu-list', 'data-inner': 'yes' }}
		maxHeight={300}
		focusedOption={{ label: 'One', value: '1' }}
	>List child</MenuList>;
	if (props.kind === 'noOptionsMessage') return <NoOptionsMessage
		{...common}
		innerProps={{ id: 'no-options', 'data-inner': 'yes' }}
	/>;
	if (props.kind === 'loadingMessage') return <LoadingMessage
		{...common}
		innerProps={{ id: 'loading', 'data-inner': 'yes' }}
	/>;
	if (props.kind === 'loadingIndicator') return <LoadingIndicator
		{...common}
		innerProps={{ id: 'loading-indicator', 'data-inner': 'yes' }}
		isDisabled={disabled}
		isFocused={focused}
		size={4}
	/>;
	if (props.kind === 'control') return <Control
		{...common}
		innerRef={null}
		innerProps={{ id: 'control', 'data-inner': 'yes' }}
		isDisabled={disabled}
		isFocused={focused}
		menuIsOpen={true}
	>Control child</Control>;
	if (props.kind === 'selectContainer') return <SelectContainer
		{...common}
		innerProps={{ id: 'container', 'data-inner': 'yes' }}
		isDisabled={disabled}
		isFocused={focused}
	>Container child</SelectContainer>;
	if (props.kind === 'valueContainer') return <ValueContainer
		{...common}
		innerProps={{ id: 'value', 'data-inner': 'yes' }}
		isDisabled={disabled}
	>Value child</ValueContainer>;
	if (props.kind === 'indicators') return <IndicatorsContainer
		{...common}
		innerProps={{ id: 'indicators', 'data-inner': 'yes' }}
		isDisabled={disabled}
	>Indicators child</IndicatorsContainer>;
	if (props.kind === 'placeholder') return <Placeholder
		{...common}
		innerProps={{ id: 'placeholder', 'data-inner': 'yes' }}
		isDisabled={disabled}
		isFocused={focused}
	>Choose one</Placeholder>;
	if (props.kind === 'singleValue') return <SingleValue
		{...common}
		data={{ label: 'One', value: '1' }}
		innerProps={{ id: 'single', 'data-inner': 'yes' }}
		isDisabled={disabled}
	>One</SingleValue>;
	return <Option
		{...common}
		data={{ label: 'One', value: '1' }}
		innerRef={null}
		innerProps={{ id: 'option', role: 'option', 'data-inner': 'yes' }}
		label="One"
		type="option"
		isDisabled={disabled}
		isFocused={focused}
		isSelected={props.selected ?? false}
	>One</Option>;
}
