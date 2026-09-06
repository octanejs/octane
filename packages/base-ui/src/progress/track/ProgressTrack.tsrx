'use client';
import type * as React from 'octane';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useProgressRootContext } from '../root/ProgressRootContext.tsrx';
import { progressStateAttributesMapping } from '../root/stateAttributesMapping';
import type { ProgressRootState } from '../root/ProgressRoot.tsrx';
import type { BaseUIComponentProps } from '../../internals/types';

/**
 * Contains the progress bar indicator.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Progress](https://base-ui.com/react/components/progress)
 */
export const ProgressTrack = function ProgressTrack(
	componentPropsWithRef: React.PropsWithoutRef<ProgressTrack.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const { state } = useProgressRootContext();

	const element = useRenderElement('div', componentProps, {
		state,
		ref: forwardedRef,
		props: elementProps,
		stateAttributesMapping: progressStateAttributesMapping,
	});

	return element;
};

export interface ProgressTrackState extends ProgressRootState {}

export interface ProgressTrackProps extends BaseUIComponentProps<'div', ProgressTrackState> {}

export namespace ProgressTrack {
	export type State = ProgressTrackState;
	export type Props = ProgressTrackProps;
}
