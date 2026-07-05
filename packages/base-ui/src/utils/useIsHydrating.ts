// Ported from .base-ui/packages/react/src/utils/useIsHydrating.ts. React drives this via
// `useSyncExternalStore` (server snapshot `true`, client snapshot `false`) so the first client
// paint of a hydrated tree matches the server, then flips to `false`. octane's binding renders
// client-only in these tests, so a fresh mount is never hydrating — returns `false`. It only
// gates the `thumbAlignment: 'edge'` pre-hydration visibility path (inert for the default
// `center` alignment).
export function useIsHydrating(): boolean {
	return false;
}
