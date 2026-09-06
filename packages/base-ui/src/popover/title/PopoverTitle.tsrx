'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useBaseUiId } from '../../internals/useBaseUiId';

/**
 * A heading that labels the popover.
 * Renders an `<h2>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 */
export const PopoverTitle = function PopoverTitle(
	componentPropsWithRef: React.PropsWithoutRef<PopoverTitle.Props> & {
		ref?: React.Ref<HTMLHeadingElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const store = usePopoverRootContext();

	const id = useBaseUiId(elementProps.id);

	store.useSyncedValueWithCleanup('titleElementId', id);

	const element = useRenderElement('h2', componentProps, {
		ref: forwardedRef,
		props: [{ id }, elementProps],
	});

	return element;
};

export interface PopoverTitleState {}

export interface PopoverTitleProps extends BaseUIComponentProps<
	'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
	PopoverTitleState
> {}

export namespace PopoverTitle {
	export type State = PopoverTitleState;
	export type Props = PopoverTitleProps;
}
