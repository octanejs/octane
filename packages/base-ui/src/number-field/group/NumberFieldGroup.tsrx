'use client';
import type * as React from 'octane';
import { useNumberFieldRootContext } from '../root/NumberFieldRootContext';
import type { NumberFieldRootState } from '../root/NumberFieldRoot.tsrx';
import type { BaseUIComponentProps } from '../../internals/types';
import { stateAttributesMapping } from '../utils/stateAttributesMapping';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * Groups the input with the increment and decrement buttons.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Number Field](https://base-ui.com/react/components/number-field)
 */
export const NumberFieldGroup = function NumberFieldGroup(
	componentPropsWithRef: React.PropsWithoutRef<NumberFieldGroup.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const { state } = useNumberFieldRootContext();

	const element = useRenderElement('div', componentProps, {
		ref: forwardedRef,
		state,
		props: [{ role: 'group' }, elementProps],
		stateAttributesMapping,
	});

	return element;
};

export interface NumberFieldGroupState extends NumberFieldRootState {}

export interface NumberFieldGroupProps extends BaseUIComponentProps<'div', NumberFieldGroupState> {}

export namespace NumberFieldGroup {
	export type State = NumberFieldGroupState;
	export type Props = NumberFieldGroupProps;
}
