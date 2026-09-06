'use client';
import type * as React from 'octane';
import { useDialogRootContext } from '../root/DialogRootContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { useButton } from '../../internals/use-button';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';

/**
 * A button that closes the dialog.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Dialog](https://base-ui.com/react/components/dialog)
 */
export const DialogClose = function DialogClose(
	componentPropsWithRef: React.PropsWithoutRef<DialogClose.Props> & {
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

	const store = useDialogRootContext();
	const open = store.useState('open');

	const { getButtonProps, buttonRef } = useButton({
		disabled,
		native: nativeButton,
	});

	const state: DialogCloseState = { disabled };

	function handleClick(event: React.MouseEvent) {
		if (open) {
			store.setOpen(false, createChangeEventDetails(REASONS.closePress, event));
		}
	}

	return useRenderElement('button', componentProps, {
		state,
		ref: [forwardedRef, buttonRef],
		props: [{ onClick: handleClick }, elementProps, getButtonProps],
	});
};

export interface DialogCloseProps
	extends NativeButtonProps, BaseUIComponentProps<'button', DialogCloseState> {}

export interface DialogCloseState {
	/**
	 * Whether the button is currently disabled.
	 */
	disabled: boolean;
}

export namespace DialogClose {
	export type Props = DialogCloseProps;
	export type State = DialogCloseState;
}
