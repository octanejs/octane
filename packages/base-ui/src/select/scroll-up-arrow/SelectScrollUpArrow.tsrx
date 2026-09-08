'use client';
import * as React from 'octane';
import { SelectScrollArrow } from '../scroll-arrow/SelectScrollArrow.tsrx';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * An element that scrolls the select popup up when hovered. Does not render when using touch input.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export const SelectScrollUpArrow = function SelectScrollUpArrow(
	propsWithRef: React.PropsWithoutRef<SelectScrollUpArrow.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...props } = propsWithRef;
	return <SelectScrollArrow {...props} ref={forwardedRef} direction="up" />;
};

export interface SelectScrollUpArrowState {}

export interface SelectScrollUpArrowProps extends BaseUIComponentProps<
	'div',
	SelectScrollUpArrowState
> {
	/**
	 * Whether to keep the HTML element in the DOM while the select popup is not scrollable.
	 * @default false
	 */
	keepMounted?: boolean | undefined;
}

export namespace SelectScrollUpArrow {
	export type State = SelectScrollUpArrowState;
	export type Props = SelectScrollUpArrowProps;
}
