// Ported from .base-ui/packages/react/src/toggle-group/ToggleGroup.tsx (v1.6.0). Provides a
// shared value to a set of <Toggle>s and manages roving focus via CompositeRoot. Standalone
// (no Toolbar) it renders `<CompositeRoot>` as a `role="group"` div; the Toolbar path (which
// renders the plain `element`) lands with Toolbar in a later phase.
//
// octane: forwardRef → ref-as-prop.
import { createElement, useMemo } from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { useControlled } from './utils/useControlled';
import { useStableCallback } from './utils/useStableCallback';
import { CompositeRoot } from './utils/composite/CompositeRoot';
import { ToggleGroupContext, type ToggleGroupContextValue } from './utils/ToggleGroupContext';

const EMPTY_ARRAY: never[] = [];

export interface ToggleGroupState {
	disabled: boolean;
	multiple: boolean;
	orientation: 'horizontal' | 'vertical';
}

const stateAttributesMapping: StateAttributesMapping<ToggleGroupState> = {
	multiple(value: boolean): Record<string, string> | null {
		if (value) {
			return { 'data-multiple': '' };
		}
		return null;
	},
};

export interface ToggleGroupProps<Value extends string = string> {
	value?: readonly Value[];
	defaultValue?: readonly Value[];
	disabled?: boolean;
	loopFocus?: boolean;
	onValueChange?: (groupValue: Value[], eventDetails: any) => void;
	orientation?: 'horizontal' | 'vertical';
	multiple?: boolean;
	render?: RenderProp<ToggleGroupState>;
	className?: string | ((state: ToggleGroupState) => string | undefined);
	style?: Record<string, any> | ((state: ToggleGroupState) => Record<string, any> | undefined);
	ref?: any;
	[key: string]: any;
}

function ToggleGroup<Value extends string = string>(props: ToggleGroupProps<Value>): any {
	const slot = S('ToggleGroup');
	const {
		defaultValue: defaultValueProp,
		disabled: disabledProp = false,
		loopFocus = true,
		onValueChange,
		orientation = 'horizontal',
		multiple = false,
		value: valueProp,
		className,
		render,
		style,
		ref,
		...elementProps
	} = props;

	// Toolbar contexts (Phase-later) are always absent standalone.
	const isValueInitialized = useMemo(
		() => valueProp !== undefined || defaultValueProp !== undefined,
		[valueProp, defaultValueProp],
		subSlot(slot, 'init'),
	);

	const disabled = disabledProp;

	const [groupValue, setValueState] = useControlled<readonly Value[]>(
		{
			controlled: valueProp,
			default: valueProp === undefined ? (defaultValueProp ?? EMPTY_ARRAY) : undefined,
			name: 'ToggleGroup',
			state: 'value',
		},
		subSlot(slot, 'value'),
	);

	const setGroupValue = useStableCallback(
		(newValue: Value, nextPressed: boolean, eventDetails: any) => {
			let newGroupValue: Value[];
			if (multiple) {
				newGroupValue = groupValue.slice();
				if (nextPressed) {
					newGroupValue.push(newValue);
				} else {
					newGroupValue.splice(groupValue.indexOf(newValue), 1);
				}
			} else {
				newGroupValue = nextPressed ? [newValue] : [];
			}
			onValueChange?.(newGroupValue, eventDetails);
			if (eventDetails.isCanceled) {
				return;
			}
			setValueState(newGroupValue);
		},
		subSlot(slot, 'setGroup'),
	);

	const state: ToggleGroupState = { disabled, multiple, orientation };

	const contextValue: ToggleGroupContextValue<Value> = useMemo(
		() => ({ disabled, orientation, setGroupValue, value: groupValue, isValueInitialized }),
		[disabled, orientation, setGroupValue, groupValue, isValueInitialized],
		subSlot(slot, 'ctx'),
	);

	const defaultProps = { role: 'group' };

	const compositeRoot = createElement(CompositeRoot, {
		render,
		className,
		style,
		state,
		refs: [ref],
		props: [defaultProps, elementProps],
		stateAttributesMapping,
		loopFocus,
		enableHomeAndEndKeys: true,
		orientation,
	});

	return createElement(ToggleGroupContext.Provider, {
		value: contextValue,
		children: compositeRoot,
	});
}

export { ToggleGroup };
