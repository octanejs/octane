// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/overlays/Overlay.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; `ReactDOM.createPortal` →
// octane's `createPortal(children, container)` (see aria memory octane-portal-as-value);
// the plain-`.ts` `Overlay` component uses the S()/subSlot component-slot convention; the
// Provider descriptor keeps a stable `{ value, children }` shape; React's ReactNode/JSX/Context
// types → `any`; `useOverlayFocusContain` gets public-hook slot threading.
import { ClearPressResponder } from '../interactions/PressResponder';
import { FocusScope } from '../focus/FocusScope';
import { createContext, createElement, createPortal, useContext, useMemo, useState } from 'octane';
import { useIsSSR } from '../ssr/SSRProvider';
import { useLayoutEffect } from '../utils/useLayoutEffect';
import { useUNSAFE_PortalContext } from './PortalProvider';

import { S, splitSlot, subSlot } from '../internal';

export interface OverlayProps {
	/**
	 * The container element in which the overlay portal will be placed.
	 *
	 * @default document.body
	 */
	portalContainer?: Element;
	/** The overlay to render in the portal. */
	children: any;
	/**
	 * Disables default focus management for the overlay, including containment and restoration.
	 * This option should be used very carefully. When focus management is disabled, you must
	 * implement focus containment and restoration to ensure the overlay is keyboard accessible.
	 */
	disableFocusManagement?: boolean;
	/**
	 * Whether to contain focus within the overlay.
	 */
	shouldContainFocus?: boolean;
	/**
	 * Whether the overlay is currently performing an exit animation. When true,
	 * focus is allowed to move outside.
	 */
	isExiting?: boolean;
}

interface OverlayContextValue {
	contain: boolean;
	setContain: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export const OverlayContext = createContext<OverlayContextValue | null>(null);

/**
 * A container which renders an overlay such as a popover or modal in a portal,
 * and provides a focus scope for the child elements.
 */
export function Overlay(props: OverlayProps): any {
	const slot = S('Overlay');
	let isSSR = useIsSSR(subSlot(slot, 'ssr'));
	let { portalContainer = isSSR ? null : document.body, isExiting } = props;
	let [contain, setContain] = useState(false, subSlot(slot, 'contain'));
	let contextValue = useMemo(
		() => ({ contain, setContain }),
		[contain, setContain],
		subSlot(slot, 'context'),
	);

	let { getContainer } = useUNSAFE_PortalContext();
	if (!props.portalContainer && getContainer) {
		portalContainer = getContainer();
	}

	if (!portalContainer) {
		return null;
	}

	let contents = props.children;
	if (!props.disableFocusManagement) {
		contents = createElement(FocusScope, {
			restoreFocus: true,
			contain: (props.shouldContainFocus || contain) && !isExiting,
			children: contents,
		});
	}

	contents = createElement(OverlayContext.Provider, {
		value: contextValue as OverlayContextValue,
		children: createElement(ClearPressResponder, { children: contents }),
	});

	return createPortal(contents, portalContainer);
}

/** @private */
export function useOverlayFocusContain(): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useOverlayFocusContain(slot: symbol | undefined): void;
export function useOverlayFocusContain(...args: any[]): void {
	const [, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useOverlayFocusContain');
	let ctx = useContext(OverlayContext);
	let setContain = ctx?.setContain;
	useLayoutEffect(
		() => {
			setContain?.(true);
		},
		[setContain],
		subSlot(slot, 'contain'),
	);
}
