'use client';
import type * as React from 'octane';
import { usePreviewCardRootContext } from '../root/PreviewCardContext';
import type { BaseUIComponentProps } from '../../internals/types';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping';
import type { TransitionStatus } from '../../internals/useTransitionStatus';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * A presentational overlay displayed beneath the popup.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Preview Card](https://base-ui.com/react/components/preview-card)
 */
export const PreviewCardBackdrop = function PreviewCardBackdrop(
	componentPropsWithRef: React.PropsWithoutRef<PreviewCardBackdrop.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const store = usePreviewCardRootContext();
	const open = store.useState('open');
	const mounted = store.useState('mounted');
	const transitionStatus = store.useState('transitionStatus');

	const state: PreviewCardBackdropState = {
		open,
		transitionStatus,
	};

	const element = useRenderElement('div', componentProps, {
		state,
		ref: [forwardedRef],
		props: [
			{
				role: 'presentation',
				hidden: !mounted,
				style: {
					pointerEvents: 'none',
					userSelect: 'none',
					WebkitUserSelect: 'none',
				},
			},
			elementProps,
		],
		stateAttributesMapping: popupTransitionStateMapping,
	});

	return element;
};

export interface PreviewCardBackdropState {
	/**
	 * Whether the preview card is currently open.
	 */
	open: boolean;
	/**
	 * The transition status of the component.
	 */
	transitionStatus: TransitionStatus;
}

export interface PreviewCardBackdropProps extends BaseUIComponentProps<
	'div',
	PreviewCardBackdropState
> {}

export namespace PreviewCardBackdrop {
	export type State = PreviewCardBackdropState;
	export type Props = PreviewCardBackdropProps;
}
