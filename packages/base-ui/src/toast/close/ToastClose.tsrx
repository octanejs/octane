'use client';
import * as React from 'octane';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { useToastRootContext } from '../root/ToastRootContext';
import { useToastProviderContext } from '../provider/ToastProviderContext';
import { useButton } from '../../internals/use-button/useButton';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * Closes the toast when clicked.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Toast](https://base-ui.com/react/components/toast)
 */
export const ToastClose = function ToastClose(
	componentPropsWithRef: React.PropsWithoutRef<ToastClose.Props> & {
		ref?: React.Ref<HTMLButtonElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const {
		render,
		className,
		style,
		disabled,
		nativeButton = true,
		...elementProps
	} = componentProps;

	const store = useToastProviderContext();
	const { toast, expanded } = useToastRootContext();

	const [hasFocus, setHasFocus] = React.useState(false);

	const { getButtonProps, buttonRef } = useButton({
		disabled,
		native: nativeButton,
	});

	const state: ToastCloseState = {
		type: toast.type,
	};

	return useRenderElement('button', componentProps, {
		ref: [forwardedRef, buttonRef],
		state,
		props: [
			{
				'aria-hidden': !expanded && !hasFocus,
				onClick() {
					store.closeToast(toast.id);
				},
				onFocus() {
					setHasFocus(true);
				},
				onBlur() {
					setHasFocus(false);
				},
			},
			elementProps,
			getButtonProps,
		],
	});
};

export interface ToastCloseState {
	/**
	 * The type of the toast.
	 */
	type: string | undefined;
}

export interface ToastCloseProps
	extends NativeButtonProps, BaseUIComponentProps<'button', ToastCloseState> {}

export namespace ToastClose {
	export type State = ToastCloseState;
	export type Props = ToastCloseProps;
}
