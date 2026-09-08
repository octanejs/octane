'use client';
import * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useSelectRootContext } from '../root/SelectRootContext';
import {
	resolveMultipleLabels,
	resolveSelectedLabel,
} from '../../internals/resolveValueLabel.tsrx';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';

const stateAttributesMapping: StateAttributesMapping<SelectValueState> = {
	value: () => null,
};

/**
 * A text label of the currently selected item.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export const SelectValue = function SelectValue(
	componentPropsWithRef: React.PropsWithoutRef<SelectValue.Props> & {
		ref?: React.Ref<HTMLSpanElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const {
		className,
		render,
		children: childrenProp,
		placeholder,
		style,
		...elementProps
	} = componentProps;

	const store = useSelectRootContext();

	const value = store.useState('value');
	const items = store.useState('items');
	const itemToStringLabel = store.useState('itemToStringLabel');
	const hasSelectedValue = store.useState('hasSelectedValue');

	const shouldCheckNullItemLabel = !hasSelectedValue && placeholder != null && childrenProp == null;
	const hasNullLabel = store.useState('hasNullItemLabel', shouldCheckNullItemLabel);

	const state: SelectValueState = {
		value,
		placeholder: !hasSelectedValue,
	};

	let children = null;
	if (typeof childrenProp === 'function' && !React.isChildrenBlock(childrenProp)) {
		children = childrenProp(value);
	} else if (childrenProp != null) {
		children = childrenProp;
	} else if (shouldCheckNullItemLabel && !hasNullLabel) {
		children = placeholder;
	} else if (Array.isArray(value)) {
		children = resolveMultipleLabels(value, items, itemToStringLabel);
	} else {
		children = resolveSelectedLabel(value, items, itemToStringLabel);
	}

	const element = useRenderElement('span', componentProps, {
		state,
		ref: [forwardedRef, store.context.valueRef],
		props: [{ children }, elementProps],
		stateAttributesMapping,
	});

	return element;
};

export interface SelectValueState {
	/**
	 * The value of the currently selected item.
	 */
	value: any;
	/**
	 * Whether the placeholder is being displayed.
	 */
	placeholder: boolean;
}

export interface SelectValueProps extends Omit<
	BaseUIComponentProps<'span', SelectValueState>,
	'children'
> {
	/**
	 * Accepts a function that returns a `ReactNode` to format the selected value.
	 * Treat the value as read-only: in `multiple` mode it may be a shared frozen array
	 * when nothing is selected.
	 * @example
	 * ```tsx
	 * <Select.Value>
	 *   {(value: string | null) => value ? labels[value] : 'No value'}
	 * </Select.Value>
	 * ```
	 */
	children?: NonNullable<React.OctaneNode> | null | undefined | ((value: any) => React.OctaneNode);
	/**
	 * The placeholder value to display when no value is selected.
	 * This is overridden by `children` if specified, or by a null item's label in `items`.
	 */
	placeholder?: React.OctaneNode;
}

export namespace SelectValue {
	export type State = SelectValueState;
	export type Props = SelectValueProps;
}
