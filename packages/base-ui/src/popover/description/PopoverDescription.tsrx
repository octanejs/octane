'use client';
import type * as React from 'octane';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import type { BaseUIComponentProps } from '../../internals/types';
import { useBaseUiId } from '../../internals/useBaseUiId';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * A paragraph with additional information about the popover.
 * Renders a `<p>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 */
export const PopoverDescription = function PopoverDescription(
	componentPropsWithRef: React.PropsWithoutRef<PopoverDescription.Props> & {
		ref?: React.Ref<HTMLParagraphElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const store = usePopoverRootContext();

	const id = useBaseUiId(elementProps.id);

	store.useSyncedValueWithCleanup('descriptionElementId', id);

	const element = useRenderElement('p', componentProps, {
		ref: forwardedRef,
		props: [{ id }, elementProps],
	});

	return element;
};

export interface PopoverDescriptionState {}

export interface PopoverDescriptionProps extends BaseUIComponentProps<
	'p',
	PopoverDescriptionState
> {}

export namespace PopoverDescription {
	export type State = PopoverDescriptionState;
	export type Props = PopoverDescriptionProps;
}
