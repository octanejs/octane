'use client';
import type * as React from 'octane';
import { useTooltipRootContext } from '../root/TooltipRootContext';
import { useTooltipPositionerContext } from '../positioner/TooltipPositionerContext';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { popupViewportStateMapping, usePopupViewport } from '../../utils/usePopupViewport.tsrx';

/**
 * A viewport for displaying content transitions.
 * This component is only required if one popup can be opened by multiple triggers, its content
 * changes based on the trigger, and switching between them is animated.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Tooltip](https://base-ui.com/react/components/tooltip)
 */
export const TooltipViewport = function TooltipViewport(
	componentPropsWithRef: React.PropsWithoutRef<TooltipViewport.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, children, ...elementProps } = componentProps;

	const store = useTooltipRootContext();
	const positioner = useTooltipPositionerContext();

	const instantType = store.useState('instantType');

	const { children: childrenToRender, state: viewportState } = usePopupViewport({
		store,
		side: positioner.side,
		children,
	});

	const state: TooltipViewportState = {
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

export interface TooltipViewportState {
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
	instant: 'delay' | 'dismiss' | 'focus' | undefined;
}

export interface TooltipViewportProps extends BaseUIComponentProps<'div', TooltipViewportState> {
	/**
	 * The content to render inside the transition container.
	 */
	children?: React.OctaneNode;
}

export namespace TooltipViewport {
	export type Props = TooltipViewportProps;
	export type State = TooltipViewportState;
}
