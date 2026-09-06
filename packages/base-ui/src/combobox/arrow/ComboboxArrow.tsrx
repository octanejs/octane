'use client';
import type * as React from 'octane';
import { useComboboxPositionerContext } from '../positioner/ComboboxPositionerContext.tsrx';
import { useComboboxRootContext } from '../root/ComboboxRootContext.tsrx';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import type { Side, Align } from '../../internals/useAnchorPositioning';
import type { BaseUIComponentProps } from '../../internals/types';
import { popupStateMapping } from '../../utils/popupStateMapping';

/**
 * Displays an element positioned against the anchor.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export const ComboboxArrow = function ComboboxArrow(
	componentPropsWithRef: React.PropsWithoutRef<ComboboxArrow.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const store = useComboboxRootContext();
	const { arrowRef, side, align, arrowUncentered, arrowStyles } = useComboboxPositionerContext();

	const open = store.useState('open');

	const state: ComboboxArrowState = {
		open,
		side,
		align,
		uncentered: arrowUncentered,
	};

	return useRenderElement('div', componentProps, {
		ref: [arrowRef, forwardedRef],
		stateAttributesMapping: popupStateMapping,
		state,
		props: {
			style: arrowStyles,
			'aria-hidden': true,
			...elementProps,
		},
	});
};

export interface ComboboxArrowState {
	/**
	 * Whether the popup is currently open.
	 */
	open: boolean;
	/**
	 * The side of the anchor the component is placed on.
	 */
	side: Side;
	/**
	 * The alignment of the component relative to the anchor.
	 */
	align: Align;
	/**
	 * Whether the arrow cannot be centered on the anchor.
	 */
	uncentered: boolean;
}

export interface ComboboxArrowProps extends BaseUIComponentProps<'div', ComboboxArrowState> {}

export namespace ComboboxArrow {
	export type State = ComboboxArrowState;
	export type Props = ComboboxArrowProps;
}
