'use client';
import type * as React from 'octane';
import { useSelectPositionerContext } from '../positioner/SelectPositionerContext';
import { useSelectRootContext } from '../root/SelectRootContext';
import type { BaseUIComponentProps } from '../../internals/types';
import type { Align, Side } from '../../internals/useAnchorPositioning';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * Displays an element positioned against the select popup anchor.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export const SelectArrow = function SelectArrow(
	componentPropsWithRef: React.PropsWithoutRef<SelectArrow.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const store = useSelectRootContext();
	const { side, align, arrowRef, arrowStyles, arrowUncentered, alignItemWithTriggerActive } =
		useSelectPositionerContext();

	const open = store.useState('open');

	const state: SelectArrowState = {
		open,
		side,
		align,
		uncentered: arrowUncentered,
	};

	const element = useRenderElement('div', componentProps, {
		state,
		ref: [arrowRef, forwardedRef],
		props: [{ style: arrowStyles, 'aria-hidden': true }, elementProps],
		stateAttributesMapping: popupTransitionStateMapping,
	});

	if (alignItemWithTriggerActive) {
		return null;
	}

	return element;
};

export interface SelectArrowState {
	/**
	 * Whether the select popup is currently open.
	 */
	open: boolean;
	/**
	 * The side of the anchor the component is placed on.
	 */
	side: Side | 'none';
	/**
	 * The alignment of the component relative to the anchor.
	 */
	align: Align;
	/**
	 * Whether the arrow cannot be centered on the anchor.
	 */
	uncentered: boolean;
}

export interface SelectArrowProps extends BaseUIComponentProps<'div', SelectArrowState> {}

export namespace SelectArrow {
	export type State = SelectArrowState;
	export type Props = SelectArrowProps;
}
