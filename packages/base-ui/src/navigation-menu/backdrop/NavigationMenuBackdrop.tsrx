'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useNavigationMenuRootContext } from '../root/NavigationMenuRootContext';
import type { TransitionStatus } from '../../internals/useTransitionStatus';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping';

/**
 * A backdrop for the navigation menu popup.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 */
export const NavigationMenuBackdrop = function NavigationMenuBackdrop(
	componentPropsWithRef: React.PropsWithoutRef<NavigationMenuBackdrop.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const { open, mounted, transitionStatus } = useNavigationMenuRootContext();

	const state: NavigationMenuBackdropState = {
		open,
		transitionStatus,
	};

	const element = useRenderElement('div', componentProps, {
		state,
		ref: forwardedRef,
		props: [
			{
				role: 'presentation',
				hidden: !mounted,
				style: {
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

export interface NavigationMenuBackdropState {
	/**
	 * If `true`, the popup is open.
	 */
	open: boolean;
	/**
	 * The transition status of the popup.
	 */
	transitionStatus: TransitionStatus;
}

export interface NavigationMenuBackdropProps extends BaseUIComponentProps<
	'div',
	NavigationMenuBackdropState
> {}

export namespace NavigationMenuBackdrop {
	export type State = NavigationMenuBackdropState;
	export type Props = NavigationMenuBackdropProps;
}
