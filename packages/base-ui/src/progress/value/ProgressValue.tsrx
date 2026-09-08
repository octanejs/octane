'use client';
import * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useProgressRootContext } from '../root/ProgressRootContext.tsrx';
import type { ProgressRootState } from '../root/ProgressRoot.tsrx';
import { progressStateAttributesMapping } from '../root/stateAttributesMapping';
/**
 * A text element displaying the current value.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Progress](https://base-ui.com/react/components/progress)
 */
export const ProgressValue = function ProgressValue(
	componentPropsWithRef: React.PropsWithoutRef<ProgressValue.Props> & {
		ref?: React.Ref<HTMLSpanElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { className, render, children, style, ...elementProps } = componentProps;

	const { value, formattedValue, state } = useProgressRootContext();

	// Follow `status` rather than re-deriving it: a non-finite `value` is also indeterminate, and
	// has no formatted text to show.
	const indeterminate = state.status === 'indeterminate';
	const formattedValueArg = indeterminate ? 'indeterminate' : formattedValue;
	const formattedValueDisplay = indeterminate ? null : formattedValue;

	const element = useRenderElement('span', componentProps, {
		state,
		ref: forwardedRef,
		props: [
			{
				'aria-hidden': true,
				children:
					typeof children === 'function' && !React.isChildrenBlock(children)
						? children(formattedValueArg, value)
						: formattedValueDisplay,
			},
			elementProps,
		],
		stateAttributesMapping: progressStateAttributesMapping,
	});

	return element;
};

export interface ProgressValueState extends ProgressRootState {}

export interface ProgressValueProps extends Omit<
	BaseUIComponentProps<'span', ProgressValueState>,
	'children'
> {
	children?:
		null | ((formattedValue: string | null, value: number | null) => React.OctaneNode) | undefined;
}

export namespace ProgressValue {
	export type State = ProgressValueState;
	export type Props = ProgressValueProps;
}
