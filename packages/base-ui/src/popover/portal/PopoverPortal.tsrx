'use client';
import * as React from 'octane';
import { FloatingPortal } from '../../floating-ui-react';
import { type BaseUIComponentProps } from '../../internals/types';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import { PopoverPortalContext } from './PopoverPortalContext';

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 */
export const PopoverPortal = function PopoverPortal(
	propsWithRef: React.PropsWithoutRef<PopoverPortal.Props> & { ref?: React.Ref<HTMLDivElement> },
) {
	const { ref: forwardedRef = null, ...props } = propsWithRef;
	const { keepMounted = false, ...portalProps } = props;

	const store = usePopoverRootContext();
	const mounted = store.useState('mounted');

	const shouldRender = mounted || keepMounted;
	if (!shouldRender) {
		return null;
	}

	return (
		<PopoverPortalContext.Provider value={keepMounted}>
			<FloatingPortal ref={forwardedRef} {...portalProps} />
		</PopoverPortalContext.Provider>
	);
};

export interface PopoverPortalState {}

export interface PopoverPortalProps extends BaseUIComponentProps<'div', PopoverPortalState> {
	/**
	 * Whether to keep the portal mounted in the DOM while the popup is hidden.
	 * @default false
	 */
	keepMounted?: boolean | undefined;
	/**
	 * A parent element to render the portal element into.
	 */
	container?:
		HTMLElement | ShadowRoot | React.RefObject<HTMLElement | ShadowRoot | null> | null | undefined;
}

export namespace PopoverPortal {
	export type State = PopoverPortalState;
	export type Props = PopoverPortalProps;
}
