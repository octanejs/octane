// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/overlays/PortalProvider.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement` with a stable `{ value, children }`
// Provider descriptor shape; React's `ReactNode`/`JSX.Element`/`React.Context` types → `any`;
// `useContext` is context-identity keyed, so it needs no slot threading.
import { createContext, createElement, useContext } from 'octane';

export interface PortalProviderProps {
	/** Should return the element where we should portal to. Can clear the context by passing null. */
	getContainer?: (() => HTMLElement | null) | null;
	/**
	 * The content of the PortalProvider. Should contain all children that want to portal their
	 * overlays to the element returned by the provided `getContainer()`.
	 */
	children: any;
}

export interface PortalProviderContextValue extends Omit<PortalProviderProps, 'children'> {}

export const PortalContext = createContext<PortalProviderContextValue>({});

/**
 * Sets the portal container for all overlay elements rendered by its children.
 */
export function UNSAFE_PortalProvider(props: PortalProviderProps): any {
	let { getContainer } = props;
	let { getContainer: ctxGetContainer } = useUNSAFE_PortalContext();
	return createElement(PortalContext.Provider, {
		value: {
			getContainer: getContainer === null ? undefined : (getContainer ?? ctxGetContainer),
		},
		children: props.children,
	});
}

export function useUNSAFE_PortalContext(): PortalProviderContextValue {
	return useContext(PortalContext) ?? {};
}
