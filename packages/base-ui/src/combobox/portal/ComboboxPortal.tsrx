'use client';
import * as React from 'octane';
import { FloatingPortal } from '../../floating-ui-react';
import { type BaseUIComponentProps } from '../../internals/types';
import { useComboboxRootContext } from '../root/ComboboxRootContext.tsrx';
import { ComboboxPortalContext } from './ComboboxPortalContext.tsrx';

/**
 * A portal element that moves the popup to a different part of the DOM.
 * By default, the portal element is appended to `<body>`.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export const ComboboxPortal = function ComboboxPortal(
	propsWithRef: React.PropsWithoutRef<ComboboxPortal.Props> & { ref?: React.Ref<HTMLDivElement> },
) {
	const { ref: forwardedRef = null, ...props } = propsWithRef;
	const { keepMounted = false, ...portalProps } = props;

	const store = useComboboxRootContext();

	const mounted = store.useState('mounted');
	const forceMounted = store.useState('forceMounted');

	const shouldRender = mounted || keepMounted || forceMounted;
	if (!shouldRender) {
		return null;
	}

	return (
		<ComboboxPortalContext.Provider value={keepMounted}>
			<FloatingPortal ref={forwardedRef} {...portalProps} />
		</ComboboxPortalContext.Provider>
	);
};

export interface ComboboxPortalState {}

export interface ComboboxPortalProps extends BaseUIComponentProps<'div', ComboboxPortalState> {
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

export namespace ComboboxPortal {
	export type State = ComboboxPortalState;
	export type Props = ComboboxPortalProps;
}
