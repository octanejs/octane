'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useInitialLiveRegionTextMutation } from '../utils/useInitialLiveRegionTextMutation';

/**
 * Displays a status message whose content changes are announced politely to screen readers.
 * Useful for conveying the status of an asynchronously loaded list.
 * This component's root element must remain mounted in the DOM to announce
 * changes consistently across screen readers. Avoid hiding or removing the
 * component itself with `display: none`, `hidden`, `aria-hidden`, or conditional
 * rendering. Prefer updating or conditionally rendering its children instead.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export const ComboboxStatus = function ComboboxStatus(
	componentPropsWithRef: React.PropsWithoutRef<ComboboxStatus.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, children: childrenProp, ...elementProps } = componentProps;

	const statusRef = useInitialLiveRegionTextMutation<HTMLDivElement>();

	return useRenderElement('div', componentProps, {
		ref: [forwardedRef, statusRef],
		props: [
			{
				children: childrenProp,
				role: 'status',
				'aria-live': 'polite',
				'aria-atomic': true,
			},
			elementProps,
		],
	});
};

export interface ComboboxStatusState {}

export interface ComboboxStatusProps extends BaseUIComponentProps<'div', ComboboxStatusState> {}

export namespace ComboboxStatus {
	export type State = ComboboxStatusState;
	export type Props = ComboboxStatusProps;
}
