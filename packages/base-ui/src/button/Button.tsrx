'use client';
import type * as React from 'octane';
import { useButton } from '../internals/use-button/useButton';
import { useRenderElement } from '../internals/useRenderElement.tsrx';
import type { BaseUIComponentProps, NativeButtonProps } from '../internals/types';

/**
 * A button component that can be used to trigger actions.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Button](https://base-ui.com/react/components/button)
 */
export const Button = function Button(
	componentPropsWithRef: React.PropsWithoutRef<Button.Props> & { ref?: React.Ref<HTMLElement> },
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const {
		render,
		className,
		disabled = false,
		focusableWhenDisabled = false,
		nativeButton = true,
		style,
		...elementProps
	} = componentProps;

	const { getButtonProps, buttonRef } = useButton({
		disabled,
		focusableWhenDisabled,
		native: nativeButton,
	});

	const state: ButtonState = {
		disabled,
	};

	return useRenderElement('button', componentProps, {
		state,
		ref: [forwardedRef, buttonRef],
		props: [elementProps, getButtonProps],
	});
};

export interface ButtonState {
	/**
	 * Whether the button should ignore user interaction.
	 */
	disabled: boolean;
}

export interface ButtonProps
	extends NativeButtonProps, BaseUIComponentProps<'button', ButtonState> {
	/**
	 * Whether the button should be focusable when disabled.
	 * @default false
	 */
	focusableWhenDisabled?: boolean | undefined;
}

export namespace Button {
	export type State = ButtonState;
	export type Props = ButtonProps;
}
