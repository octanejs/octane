'use client';
import type * as React from 'octane';
import { useMeterRootContext } from '../root/MeterRootContext';
import type { MeterRootState } from '../root/MeterRoot.tsrx';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useRegisteredLabelId } from '../../utils/useRegisteredLabelId';

/**
 * An accessible label for the meter.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Meter](https://base-ui.com/react/components/meter)
 */
export const MeterLabel = function MeterLabel(
	componentPropsWithRef: React.PropsWithoutRef<MeterLabel.Props> & {
		ref?: React.Ref<HTMLSpanElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, id: idProp, ...elementProps } = componentProps;

	const { setLabelId } = useMeterRootContext();

	const id = useRegisteredLabelId(idProp, setLabelId);

	return useRenderElement('span', componentProps, {
		ref: forwardedRef,
		props: [
			{
				id,
				role: 'presentation',
			},
			elementProps,
		],
	});
};

export interface MeterLabelState extends MeterRootState {}

export interface MeterLabelProps extends BaseUIComponentProps<'span', MeterLabelState> {}

export namespace MeterLabel {
	export type State = MeterLabelState;
	export type Props = MeterLabelProps;
}
