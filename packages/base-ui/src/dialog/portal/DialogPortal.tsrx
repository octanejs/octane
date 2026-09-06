'use client';
import * as React from 'octane';
import { inertValue } from '@octanejs/base-ui-utils/inertValue';
import { FloatingPortal } from '../../floating-ui-react';
import { type BaseUIComponentProps } from '../../internals/types';
import { useDialogRootContext } from '../root/DialogRootContext';
import { DialogPortalContext } from './DialogPortalContext';
import { InternalBackdrop } from '../../utils/InternalBackdrop.tsrx';

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Dialog](https://base-ui.com/react/components/dialog)
 */
export const DialogPortal = function DialogPortal(
	propsWithRef: React.PropsWithoutRef<DialogPortal.Props> & { ref?: React.Ref<HTMLDivElement> },
) {
	const { ref: forwardedRef = null, ...props } = propsWithRef;
	const { keepMounted = false, ...portalProps } = props;

	const store = useDialogRootContext();
	const mounted = store.useState('mounted');
	const modal = store.useState('modal');
	const open = store.useState('open');

	const shouldRender = mounted || keepMounted;
	if (!shouldRender) {
		return null;
	}

	return (
		<DialogPortalContext.Provider value={keepMounted}>
			<FloatingPortal ref={forwardedRef} {...portalProps}>
				{mounted && modal === true && (
					<InternalBackdrop ref={store.context.internalBackdropRef} inert={inertValue(!open)} />
				)}
				{props.children}
			</FloatingPortal>
		</DialogPortalContext.Provider>
	);
};

export interface DialogPortalState {}

export interface DialogPortalProps extends BaseUIComponentProps<'div', DialogPortalState> {
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

export namespace DialogPortal {
	export type State = DialogPortalState;
	export type Props = DialogPortalProps;
}
