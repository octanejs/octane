import { useRef } from 'react';
import {
	createRoot as octaneCreateRoot,
	flushSync as octaneFlushSync,
	type ComponentBody,
	type Root as OctaneRoot,
} from 'octane';
import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect.js';

/**
 * Owns the Octane root inside a React-rendered container: mounts it on first
 * commit, re-renders it on every commit, and tears it down on unmount.
 *
 * Repeat renders hit the Octane root's same-body fast path (props update in
 * place — Octane state, effects and DOM survive); a changed `component`
 * remounts inside Octane itself. `flushSync` commits the Octane render (and
 * its layout effects) before the browser paints the React commit; Octane
 * passive effects stay post-paint. StrictMode's double mount/unmount recreates
 * the root.
 */
export function useOctaneRoot(
	containerRef: { current: HTMLElement | null },
	component: ComponentBody,
	props: object,
): void {
	const rootRef = useRef<OctaneRoot | null>(null);
	const mountedOn = useRef<HTMLElement | null>(null);

	useIsomorphicLayoutEffect(() => {
		const container = containerRef.current!;
		if (rootRef.current !== null && mountedOn.current !== container) {
			// The `as` tag changed: React replaced the container, so the old root
			// points at detached DOM.
			rootRef.current.unmount();
			rootRef.current = null;
		}
		mountedOn.current = container;
		const root = (rootRef.current ??= octaneCreateRoot(container));
		octaneFlushSync(() => root.render(component, props));
	});

	useIsomorphicLayoutEffect(
		() => () => {
			rootRef.current?.unmount();
			rootRef.current = null;
			mountedOn.current = null;
		},
		[],
	);
}
