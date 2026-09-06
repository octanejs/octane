'use client';
import type * as React from 'octane';
import { usePreviewCardRootContext } from '../root/PreviewCardContext';
import { usePreviewCardPositionerContext } from '../positioner/PreviewCardPositionerContext';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { popupViewportStateMapping, usePopupViewport } from '../../utils/usePopupViewport.tsrx';

/**
 * A viewport for displaying content transitions.
 * This component is only required if one popup can be opened by multiple triggers, its content
 * changes based on the trigger, and switching between them is animated.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Preview Card](https://base-ui.com/react/components/preview-card)
 */
export const PreviewCardViewport = function PreviewCardViewport(
	componentPropsWithRef: React.PropsWithoutRef<PreviewCardViewport.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, children, ...elementProps } = componentProps;

	const store = usePreviewCardRootContext();
	const positioner = usePreviewCardPositionerContext();

	const instantType = store.useState('instantType');

	const { children: childrenToRender, state: viewportState } = usePopupViewport({
		store,
		side: positioner.side,
		children,
	});

	const state: PreviewCardViewportState = {
		activationDirection: viewportState.activationDirection,
		transitioning: viewportState.transitioning,
		instant: instantType,
	};

	return useRenderElement('div', componentProps, {
		state,
		ref: forwardedRef,
		props: [elementProps, { children: childrenToRender }],
		stateAttributesMapping: popupViewportStateMapping,
	});
};

export interface PreviewCardViewportState {
	/**
	 * The activation direction of the transitioned content.
	 */
	activationDirection: string | undefined;
	/**
	 * Whether the viewport is currently transitioning between contents.
	 */
	transitioning: boolean;
	/**
	 * Present if animations should be instant.
	 */
	instant: 'dismiss' | 'focus' | undefined;
}

export interface PreviewCardViewportProps extends BaseUIComponentProps<
	'div',
	PreviewCardViewportState
> {
	/**
	 * The content to render inside the transition container.
	 */
	children?: React.OctaneNode;
}

export namespace PreviewCardViewport {
	export type Props = PreviewCardViewportProps;
	export type State = PreviewCardViewportState;
}
