// @ts-check
export { hydrateRoot, initializeHydrationEventCapture, Suspense, ErrorBoundary } from 'octane';
import { createElementFromConfig } from 'octane/internal/client';

/**
 * The generated entry resolves fallback exports to functions and supplies only
 * `{ error, reset }` or `{}`. Their descriptors cannot select host form actions
 * or Fragment refs; each fallback's own output installs the capabilities it uses.
 * @template P
 * @param {import('octane').ComponentBody<P>} component
 * @param {P} props
 */
export function createElement(component, props) {
	return createElementFromConfig(undefined, component, props);
}
