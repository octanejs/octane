'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * An icon that indicates that the trigger button opens the popup.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export const ComboboxIcon = function ComboboxIcon(
	componentPropsWithRef: React.PropsWithoutRef<ComboboxIcon.Props> & {
		ref?: React.Ref<HTMLSpanElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const element = useRenderElement('span', componentProps, {
		ref: forwardedRef,
		props: [
			{
				'aria-hidden': true,
				children: '▼',
			},
			elementProps,
		],
	});

	return element;
};

export interface ComboboxIconState {}

export interface ComboboxIconProps extends BaseUIComponentProps<'span', ComboboxIconState> {}

export namespace ComboboxIcon {
	export type State = ComboboxIconState;
	export type Props = ComboboxIconProps;
}
