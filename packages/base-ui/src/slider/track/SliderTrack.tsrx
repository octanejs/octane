'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useSliderRootContext } from '../root/SliderRootContext';
import type { SliderRootState } from '../root/SliderRoot.tsrx';
import { sliderStateAttributesMapping } from '../root/stateAttributesMapping';

/**
 * Contains the slider indicator and represents the entire range of the slider.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Slider](https://base-ui.com/react/components/slider)
 */
export const SliderTrack = function SliderTrack(
	componentPropsWithRef: React.PropsWithoutRef<SliderTrack.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const { state } = useSliderRootContext();

	const element = useRenderElement('div', componentProps, {
		state,
		ref: forwardedRef,
		props: [
			{
				style: {
					position: 'relative',
				},
			},
			elementProps,
		],
		stateAttributesMapping: sliderStateAttributesMapping,
	});

	return element;
};

export interface SliderTrackState extends SliderRootState {}

export interface SliderTrackProps extends BaseUIComponentProps<'div', SliderTrackState> {}

export namespace SliderTrack {
	export type State = SliderTrackState;
	export type Props = SliderTrackProps;
}
