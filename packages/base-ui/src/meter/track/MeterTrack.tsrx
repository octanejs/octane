'use client';
import type * as React from 'octane';
import type { MeterRootState } from '../root/MeterRoot.tsrx';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * Contains the meter indicator and represents the entire range of the meter.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Meter](https://base-ui.com/react/components/meter)
 */
export const MeterTrack = function MeterTrack(
	componentPropsWithRef: React.PropsWithoutRef<MeterTrack.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	return useRenderElement('div', componentProps, {
		ref: forwardedRef,
		props: elementProps,
	});
};

export interface MeterTrackState extends MeterRootState {}

export interface MeterTrackProps extends BaseUIComponentProps<'div', MeterTrackState> {}

export namespace MeterTrack {
	export type State = MeterTrackState;
	export type Props = MeterTrackProps;
}
