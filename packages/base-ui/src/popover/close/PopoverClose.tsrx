'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useButton } from '../../internals/use-button';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { useClosePartRegistration } from '../../utils/closePart.tsrx';

/**
 * A button that closes the popover.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 */
export const PopoverClose = function PopoverClose(
	componentPropsWithRef: React.PropsWithoutRef<PopoverClose.Props> & {
		ref?: React.Ref<HTMLButtonElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const {
		render,
		className,
		style,
		disabled = false,
		nativeButton = true,
		...elementProps
	} = componentProps;

	const { buttonRef, getButtonProps } = useButton({
		disabled,
		focusableWhenDisabled: false,
		native: nativeButton,
	});

	const store = usePopoverRootContext();
	useClosePartRegistration();

	const element = useRenderElement('button', componentProps, {
		ref: [forwardedRef, buttonRef],
		props: [
			{
				onClick(event) {
					store.setOpen(false, createChangeEventDetails(REASONS.closePress, event));
				},
			},
			elementProps,
			getButtonProps,
		],
	});

	return element;
};

export interface PopoverCloseState {}

export interface PopoverCloseProps
	extends NativeButtonProps, BaseUIComponentProps<'button', PopoverCloseState> {}

export namespace PopoverClose {
	export type State = PopoverCloseState;
	export type Props = PopoverCloseProps;
}
