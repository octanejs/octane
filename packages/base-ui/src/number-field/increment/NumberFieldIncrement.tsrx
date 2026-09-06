'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { useNumberFieldStepperButton } from '../root/useNumberFieldStepperButton';
import type { NumberFieldRootState } from '../root/NumberFieldRoot.tsrx';

/**
 * A stepper button that increases the field value when clicked.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Number Field](https://base-ui.com/react/components/number-field)
 */
export const NumberFieldIncrement = function NumberFieldIncrement(
	componentPropsWithRef: React.PropsWithoutRef<NumberFieldIncrement.Props> & {
		ref?: React.Ref<HTMLButtonElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	return useNumberFieldStepperButton(componentProps, forwardedRef, true);
};

export interface NumberFieldIncrementState extends NumberFieldRootState {}

export interface NumberFieldIncrementProps
	extends NativeButtonProps, BaseUIComponentProps<'button', NumberFieldIncrementState> {}

export namespace NumberFieldIncrement {
	export type State = NumberFieldIncrementState;
	export type Props = NumberFieldIncrementProps;
}
