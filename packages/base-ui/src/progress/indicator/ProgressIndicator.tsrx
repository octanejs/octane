'use client';
import type * as React from 'octane';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import type { ProgressRootState } from '../root/ProgressRoot.tsrx';
import { useProgressRootContext } from '../root/ProgressRootContext.tsrx';
import { progressStateAttributesMapping } from '../root/stateAttributesMapping';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * Visualizes the completion status of the task.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Progress](https://base-ui.com/react/components/progress)
 */
export const ProgressIndicator = function ProgressIndicator(
	componentPropsWithRef: React.PropsWithoutRef<ProgressIndicator.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const { percentageValue, state } = useProgressRootContext();

	const indicatorStyle: React.CSSProperties =
		percentageValue == null
			? {}
			: {
					insetInlineStart: 0,
					height: 'inherit',
					width: `${percentageValue}%`,
				};

	const element = useRenderElement('div', componentProps, {
		state,
		ref: forwardedRef,
		props: [
			{
				style: indicatorStyle,
			},
			elementProps,
		],
		stateAttributesMapping: progressStateAttributesMapping,
	});

	return element;
};

export interface ProgressIndicatorState extends ProgressRootState {}

export interface ProgressIndicatorProps extends BaseUIComponentProps<
	'div',
	ProgressIndicatorState
> {}

export namespace ProgressIndicator {
	export type State = ProgressIndicatorState;
	export type Props = ProgressIndicatorProps;
}
