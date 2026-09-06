'use client';
import type * as React from 'octane';
import { useDialogRootContext } from '../root/DialogRootContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useBaseUiId } from '../../internals/useBaseUiId';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * A paragraph with additional information about the dialog.
 * Renders a `<p>` element.
 *
 * Documentation: [Base UI Dialog](https://base-ui.com/react/components/dialog)
 */
export const DialogDescription = function DialogDescription(
	componentPropsWithRef: React.PropsWithoutRef<DialogDescription.Props> & {
		ref?: React.Ref<HTMLParagraphElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, id: idProp, ...elementProps } = componentProps;

	const store = useDialogRootContext();

	const id = useBaseUiId(idProp);

	store.useSyncedValueWithCleanup('descriptionElementId', id);

	return useRenderElement('p', componentProps, {
		ref: forwardedRef,
		props: [{ id }, elementProps],
	});
};

export interface DialogDescriptionProps extends BaseUIComponentProps<'p', DialogDescriptionState> {}

export interface DialogDescriptionState {}

export namespace DialogDescription {
	export type Props = DialogDescriptionProps;
	export type State = DialogDescriptionState;
}
