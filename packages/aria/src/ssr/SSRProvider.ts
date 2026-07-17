// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/ssr/SSRProvider.tsx).
// octane always has SSR-stable `useId` and `useSyncExternalStore`, so React's legacy
// (<18) SSRProvider machinery — the context-threaded id counter, the Fiber-keyed
// StrictMode double-render guard — collapses away exactly like upstream's modern path:
// `SSRProvider` is a pass-through, `useSSRSafeId` prefixes the framework id, and
// `useIsSSR` reads the store-snapshot seam (server snapshot → true, client → false).
import { useId as octaneUseId, useState, useSyncExternalStore } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

export interface SSRProviderProps {
	/** Your application here. */
	children: any;
}

/**
 * Legacy-React compatibility wrapper — a no-op pass-through in octane, matching
 * upstream's behavior on React 18+.
 */
export function SSRProvider(props: SSRProviderProps): any {
	return props.children;
}

// In order to support multiple copies of the library potentially being on the page at
// once, client-only ids get a random per-module prefix. When the app was server
// rendered (or in tests, where ids must be deterministic), the plain `react-aria`
// prefix is used so server and client agree.
const defaultPrefix = String(Math.round(Math.random() * 10000000000));

/** @private */
export function useSSRSafeId(defaultId?: string): string;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSSRSafeId(defaultId: string | undefined, slot: symbol | undefined): string;
export function useSSRSafeId(...args: any[]): string {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSSRSafeId');
	const defaultId = user[0] as string | undefined;

	const id = octaneUseId(subSlot(slot, 'id'));
	const isSSR = useIsSSR(subSlot(slot, 'ssr'));
	const [didSSR] = useState(isSSR, subSlot(slot, 'didSSR'));
	const prefix =
		didSSR || process.env.NODE_ENV === 'test' ? 'react-aria' : `react-aria${defaultPrefix}`;
	return defaultId || `${prefix}-${id}`;
}

function getSnapshot(): boolean {
	return false;
}

function getServerSnapshot(): boolean {
	return true;
}

function subscribe(): () => void {
	// noop
	return () => {};
}

/**
 * Returns whether the component is currently being server side rendered or
 * hydrated on the client. Can be used to delay browser-specific rendering
 * until after hydration.
 */
export function useIsSSR(): boolean;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useIsSSR(slot: symbol | undefined): boolean;
export function useIsSSR(...args: any[]): boolean {
	const [, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useIsSSR');
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot, subSlot(slot, 'store'));
}
