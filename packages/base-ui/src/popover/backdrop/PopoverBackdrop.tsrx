'use client';
import type * as React from 'octane';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import type { BaseUIComponentProps } from '../../internals/types';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping';
import type { TransitionStatus } from '../../internals/useTransitionStatus';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { REASONS } from '../../internals/reasons';

/**
 * An overlay displayed beneath the popover.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 */
export const PopoverBackdrop = function PopoverBackdrop(
	propsWithRef: React.PropsWithoutRef<PopoverBackdrop.Props> & { ref?: React.Ref<HTMLDivElement> },
) {
	const { ref: forwardedRef = null, ...props } = propsWithRef;
	const { render, className, style, ...elementProps } = props;

	const store = usePopoverRootContext();

	const open = store.useState('open');
	const mounted = store.useState('mounted');
	const transitionStatus = store.useState('transitionStatus');
	const openReason = store.useState('openChangeReason');

	const state: PopoverBackdropState = {
		open,
		transitionStatus,
	};

	const element = useRenderElement('div', props, {
		state,
		ref: forwardedRef,
		props: [
			{
				role: 'presentation',
				hidden: !mounted,
				style: {
					pointerEvents: openReason === REASONS.triggerHover ? 'none' : undefined,
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

export interface PopoverBackdropState {
	/**
	 * Whether the popover is currently open.
	 */
	open: boolean;
	/**
	 * The transition status of the component.
	 */
	transitionStatus: TransitionStatus;
}

export interface PopoverBackdropProps extends BaseUIComponentProps<'div', PopoverBackdropState> {}

export namespace PopoverBackdrop {
	export type State = PopoverBackdropState;
	export type Props = PopoverBackdropProps;
}
