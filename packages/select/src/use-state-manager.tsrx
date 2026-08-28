import { useCallback, useState } from 'octane';

import type { ActionMeta, GroupBase, InputActionMeta, OnChangeValue, PropsValue } from './types';
import type { PublicBaseSelectProps } from './select.tsrx';

export type StateManagedPropKeys =
	| 'inputValue'
	| 'menuIsOpen'
	| 'onChange'
	| 'onInputChange'
	| 'onMenuClose'
	| 'onMenuOpen'
	| 'value';

export interface StateManagerAdditionalProps<Option> {
	defaultInputValue?: string;
	defaultMenuIsOpen?: boolean;
	defaultValue?: PropsValue<Option>;
}

export type StateManagerProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> =
	Omit<PublicBaseSelectProps<Option, IsMulti, Group>, StateManagedPropKeys> & Partial<
		PublicBaseSelectProps<Option, IsMulti, Group>
	> & StateManagerAdditionalProps<Option>;

export function useStateManager<
	Option,
	IsMulti extends boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
	AdditionalProps extends object = object,
>(props: StateManagerProps<Option, IsMulti, Group> & AdditionalProps) {
	const {
		defaultInputValue = '',
		defaultMenuIsOpen = false,
		defaultValue = null,
		inputValue: propsInputValue,
		menuIsOpen: propsMenuIsOpen,
		onChange: propsOnChange,
		onInputChange: propsOnInputChange,
		onMenuClose: propsOnMenuClose,
		onMenuOpen: propsOnMenuOpen,
		value: propsValue,
		...restSelectProps
	} = props;

	const [stateInputValue, setStateInputValue] = useState(
		propsInputValue !== undefined ? propsInputValue : defaultInputValue,
	);
	const [stateMenuIsOpen, setStateMenuIsOpen] = useState(
		propsMenuIsOpen !== undefined ? propsMenuIsOpen : defaultMenuIsOpen,
	);
	const [stateValue, setStateValue] = useState<PropsValue<Option>>(
		propsValue !== undefined ? propsValue : defaultValue,
	);

	const onChange = useCallback((
		value: OnChangeValue<Option, IsMulti>,
		actionMeta: ActionMeta<Option>,
	) => {
		propsOnChange?.(value, actionMeta);
		setStateValue(value);
	}, [propsOnChange]);
	const onInputChange = useCallback((value: string, actionMeta: InputActionMeta) => {
		const newValue = propsOnInputChange?.(value, actionMeta);
		setStateInputValue(newValue !== undefined ? newValue : value);
	}, [propsOnInputChange]);
	const onMenuOpen = useCallback(() => {
		propsOnMenuOpen?.();
		setStateMenuIsOpen(true);
	}, [propsOnMenuOpen]);
	const onMenuClose = useCallback(() => {
		propsOnMenuClose?.();
		setStateMenuIsOpen(false);
	}, [propsOnMenuClose]);

	return {
		...restSelectProps,
		inputValue: propsInputValue !== undefined ? propsInputValue : stateInputValue,
		menuIsOpen: propsMenuIsOpen !== undefined ? propsMenuIsOpen : stateMenuIsOpen,
		onChange,
		onInputChange,
		onMenuClose,
		onMenuOpen,
		value: propsValue !== undefined ? propsValue : stateValue,
	};
}
