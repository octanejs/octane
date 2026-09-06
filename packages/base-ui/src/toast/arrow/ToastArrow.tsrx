'use client';
import type * as React from 'octane';
import { useToastPositionerContext } from '../positioner/ToastPositionerContext';
import type { BaseUIComponentProps } from '../../internals/types';
import type { Side, Align } from '../../internals/useAnchorPositioning';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * Displays an element positioned against the toast anchor.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Toast](https://base-ui.com/react/components/toast)
 */
export const ToastArrow = function ToastArrow(
	componentPropsWithRef: React.PropsWithoutRef<ToastArrow.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { className, render, style, ...elementProps } = componentProps;

	const { arrowRef, side, align, arrowUncentered, arrowStyles } = useToastPositionerContext();

	const state: ToastArrowState = {
		side,
		align,
		uncentered: arrowUncentered,
	};

	return useRenderElement('div', componentProps, {
		state,
		ref: [forwardedRef, arrowRef],
		props: [{ style: arrowStyles, 'aria-hidden': true }, elementProps],
	});
};

export interface ToastArrowState {
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

export interface ToastArrowProps extends BaseUIComponentProps<'div', ToastArrowState> {}

export namespace ToastArrow {
	export type State = ToastArrowState;
	export type Props = ToastArrowProps;
}
