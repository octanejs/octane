// Ported from @radix-ui/react-toggle-group. A set of Toggles where `type="single"` keeps
// at most one pressed (role=radiogroup semantics per item) and `type="multiple"` allows
// any combination. Items participate in a RovingFocusGroup (single tab stop + arrow-key
// navigation) unless `rovingFocus={false}`.
import { createElement, useCallback, useMemo } from 'octane';

import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';
import * as RovingFocusGroup from './RovingFocusGroup';
import { createRovingFocusGroupScope } from './RovingFocusGroup';
import { Toggle } from './Toggle';
import { useControllableState } from './useControllableState';

const [createToggleGroupContext, createToggleGroupScope] = createContextScope('ToggleGroup', [
	createRovingFocusGroupScope,
]);
export { createToggleGroupScope };
const useRovingFocusGroupScope = createRovingFocusGroupScope();

interface ValueContext {
	type: 'single' | 'multiple';
	value: string[];
	onItemActivate: (value: string) => void;
	onItemDeactivate: (value: string) => void;
}
const [ToggleGroupValueProvider, useToggleGroupValueContext] =
	createToggleGroupContext<ValueContext>('ToggleGroup');
const [ToggleGroupContext, useToggleGroupContext] = createToggleGroupContext<{
	rovingFocus: boolean;
	disabled: boolean;
}>('ToggleGroup');

export function Root(props: any): any {
	const { type, ...toggleGroupProps } = props ?? {};
	if (type === 'single') {
		return createElement(ImplSingle, { role: 'radiogroup', ...toggleGroupProps });
	}
	if (type === 'multiple') {
		return createElement(ImplMultiple, { role: 'toolbar', ...toggleGroupProps });
	}
	throw new Error('Missing prop `type` expected on `ToggleGroup`');
}

function ImplSingle(props: any): any {
	const slot = S('ToggleGroup.Single');
	const { value: valueProp, defaultValue, onValueChange = () => {}, ...rest } = props;
	const [value, setValue] = useControllableState<string>(
		{ prop: valueProp, defaultProp: defaultValue ?? '', onChange: onValueChange },
		subSlot(slot, 'value'),
	);
	return createElement(ToggleGroupValueProvider, {
		scope: props.__scopeToggleGroup,
		type: 'single',
		value: useMemo(() => (value ? [value] : []), [value], subSlot(slot, 'arr')),
		onItemActivate: setValue,
		onItemDeactivate: useCallback(() => setValue(''), [setValue], subSlot(slot, 'off')),
		children: createElement(Impl, rest),
	});
}

function ImplMultiple(props: any): any {
	const slot = S('ToggleGroup.Multiple');
	const { value: valueProp, defaultValue, onValueChange = () => {}, ...rest } = props;
	const [value, setValue] = useControllableState<string[]>(
		{ prop: valueProp, defaultProp: defaultValue ?? [], onChange: onValueChange },
		subSlot(slot, 'value'),
	);
	const handleButtonActivate = useCallback(
		(itemValue: string) => setValue((prev: string[] = []) => [...prev, itemValue]),
		[setValue],
		subSlot(slot, 'on'),
	);
	const handleButtonDeactivate = useCallback(
		(itemValue: string) => setValue((prev: string[] = []) => prev.filter((v) => v !== itemValue)),
		[setValue],
		subSlot(slot, 'off'),
	);
	return createElement(ToggleGroupValueProvider, {
		scope: props.__scopeToggleGroup,
		type: 'multiple',
		value,
		onItemActivate: handleButtonActivate,
		onItemDeactivate: handleButtonDeactivate,
		children: createElement(Impl, rest),
	});
}

function Impl(props: any): any {
	const slot = S('ToggleGroup.Impl');
	const {
		__scopeToggleGroup,
		disabled = false,
		rovingFocus = true,
		orientation,
		dir,
		loop = true,
		...toggleGroupProps
	} = props;
	const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeToggleGroup, subSlot(slot, 'rfs'));
	const direction = dir === 'rtl' ? 'rtl' : 'ltr';
	const commonProps = { dir: direction, ...toggleGroupProps };
	return createElement(ToggleGroupContext, {
		scope: __scopeToggleGroup,
		rovingFocus,
		disabled,
		children: rovingFocus
			? createElement(RovingFocusGroup.Root, {
					asChild: true,
					...rovingFocusGroupScope,
					orientation,
					dir: direction,
					loop,
					children: createElement(Primitive.div, commonProps),
				})
			: createElement(Primitive.div, commonProps),
	});
}

export function Item(props: any): any {
	const slot = S('ToggleGroup.Item');
	const valueContext = useToggleGroupValueContext('ToggleGroupItem', props?.__scopeToggleGroup);
	const context = useToggleGroupContext('ToggleGroupItem', props?.__scopeToggleGroup);
	const rovingFocusGroupScope = useRovingFocusGroupScope(
		props?.__scopeToggleGroup,
		subSlot(slot, 'rfs'),
	);
	const pressed = valueContext.value.includes(props.value);
	const disabled = context.disabled || props.disabled;
	const commonProps = { ...props, pressed, disabled };
	return context.rovingFocus
		? createElement(RovingFocusGroup.Item, {
				asChild: true,
				...rovingFocusGroupScope,
				focusable: !disabled,
				active: pressed,
				children: createElement(ItemImpl, commonProps),
			})
		: createElement(ItemImpl, commonProps);
}

function ItemImpl(props: any): any {
	const { __scopeToggleGroup, value, ...itemProps } = props;
	const valueContext = useToggleGroupValueContext('ToggleGroupItem', __scopeToggleGroup);
	const singleProps = { role: 'radio', 'aria-checked': props.pressed, 'aria-pressed': undefined };
	const typeProps = valueContext.type === 'single' ? singleProps : undefined;
	return createElement(Toggle, {
		...typeProps,
		...itemProps,
		onPressedChange: (pressed: boolean) => {
			if (pressed) valueContext.onItemActivate(value);
			else valueContext.onItemDeactivate(value);
		},
	});
}

export { Root as ToggleGroup, Item as ToggleGroupItem };
