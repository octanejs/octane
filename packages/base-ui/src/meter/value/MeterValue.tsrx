'use client';
import * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { useMeterRootContext } from '../root/MeterRootContext';
import type { MeterRootState } from '../root/MeterRoot.tsrx';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * A text element displaying the current value.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Meter](https://base-ui.com/react/components/meter)
 */
export const MeterValue = function MeterValue(
	componentPropsWithRef: React.PropsWithoutRef<MeterValue.Props> & {
		ref?: React.Ref<HTMLSpanElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { className, render, children, style, ...elementProps } = componentProps;

	const { value, formattedValue } = useMeterRootContext();

	return useRenderElement('span', componentProps, {
		ref: forwardedRef,
		props: [
			{
				'aria-hidden': true,
				children:
					typeof children === 'function' && !React.isChildrenBlock(children)
						? children(formattedValue, value)
						: formattedValue,
			},
			elementProps,
		],
	});
};

export interface MeterValueState extends MeterRootState {}

export interface MeterValueProps extends Omit<
	BaseUIComponentProps<'span', MeterValueState>,
	'children'
> {
	children?: null | ((formattedValue: string, value: number) => React.OctaneNode) | undefined;
}

export namespace MeterValue {
	export type State = MeterValueState;
	export type Props = MeterValueProps;
}
