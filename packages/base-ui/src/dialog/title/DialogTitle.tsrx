'use client';
import type * as React from 'octane';
import { useDialogRootContext } from '../root/DialogRootContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useBaseUiId } from '../../internals/useBaseUiId';
import { type BaseUIComponentProps } from '../../internals/types';

/**
 * A heading that labels the dialog.
 * Renders an `<h2>` element.
 *
 * Documentation: [Base UI Dialog](https://base-ui.com/react/components/dialog)
 */
export const DialogTitle = function DialogTitle(
	componentPropsWithRef: React.PropsWithoutRef<DialogTitle.Props> & {
		ref?: React.Ref<HTMLHeadingElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, id: idProp, ...elementProps } = componentProps;

	const store = useDialogRootContext();

	const id = useBaseUiId(idProp);

	store.useSyncedValueWithCleanup('titleElementId', id);

	return useRenderElement('h2', componentProps, {
		ref: forwardedRef,
		props: [{ id }, elementProps],
	});
};

export interface DialogTitleProps extends BaseUIComponentProps<'h2', DialogTitleState> {}

export interface DialogTitleState {}

export namespace DialogTitle {
	export type Props = DialogTitleProps;
	export type State = DialogTitleState;
}
