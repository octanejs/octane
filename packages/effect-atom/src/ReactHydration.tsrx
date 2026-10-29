// Ported from @effect/atom-react 4.1.0
// (https://github.com/Effect-TS/effect/blob/9a91b1926a5fbfaffd302a7a41a94d4d53a1154e/packages/atom/react/src/ReactHydration.ts).
//
// Octane adaptations: hooks come from `octane`, the props use `OctaneNode`, and
// the `"use client"` directive is dropped.
/**
 * React helpers for applying dehydrated Effect Atom state to a React subtree.
 * The `HydrationBoundary` component reads the nearest `RegistryContext`,
 * hydrates new Atom values before children render, and delays updates for
 * existing Atom values until after commit so React transitions do not update
 * the current UI too early.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Hydration from 'effect/reactivity/Hydration';
import { useContext, useEffect, useMemo, type FC, type OctaneNode } from 'octane';
import { RegistryContext } from './RegistryContext.tsrx';

/**
 * Props for a boundary that applies dehydrated Atom values to the nearest
 * {@link RegistryContext} while rendering its children.
 *
 * @stability unstable
 * @category components
 * @since 4.0.0
 */
export interface HydrationBoundaryProps {
	state?: Iterable<Hydration.DehydratedAtom>;
	children?: OctaneNode;
}

/**
 * Provides a React hydration boundary that loads dehydrated Atom values into
 * the current Atom registry.
 *
 * **When to use**
 *
 * Use to apply dehydrated Atom state to a React subtree that reads from the
 * nearest `RegistryContext`.
 *
 * **Details**
 *
 * New Atom values are hydrated during render so descendants can read them
 * immediately, while values for existing Atoms are deferred until after commit
 * so transition data does not update the current UI before React accepts it.
 *
 * @see {@link Hydration.dehydrate} for producing dehydrated Atom state
 * @see {@link Hydration.hydrate} for lower-level non-React hydration
 *
 * @stability unstable
 * @category components
 * @since 4.0.0
 */
export const HydrationBoundary: FC<HydrationBoundaryProps> = ({ children, state }) => {
	const registry = useContext(RegistryContext);

	// This useMemo is for performance reasons only, everything inside it must
	// be safe to run in every render and code here should be read as "in render".
	//
	// This code needs to happen during the render phase, because after initial
	// SSR, hydration needs to happen _before_ children render. Also, if hydrating
	// during a transition, we want to hydrate as much as is safe in render so
	// we can prerender as much as possible.
	//
	// For any Atom values that already exist in the registry, we want to hold back on
	// hydrating until _after_ the render phase. The reason for this is that during
	// transitions, we don't want the existing Atom values and subscribers to update to
	// the new data on the current page, only _after_ the transition is committed.
	// If the transition is aborted, we will have hydrated any _new_ Atom values, but
	// we throw away the fresh data for any existing ones to avoid unexpectedly
	// updating the UI.
	const hydrationQueue: Array<Hydration.DehydratedAtomValue> | undefined = useMemo(() => {
		if (state) {
			const dehydratedAtoms = Array.from(state) as Array<Hydration.DehydratedAtomValue>;
			const nodes = registry.getNodes();

			const newDehydratedAtoms: Array<Hydration.DehydratedAtomValue> = [];
			const existingDehydratedAtoms: Array<Hydration.DehydratedAtomValue> = [];

			for (const dehydratedAtom of dehydratedAtoms) {
				const existingNode = nodes.get(dehydratedAtom.key);

				if (!existingNode) {
					// This is a new Atom value, safe to hydrate immediately
					newDehydratedAtoms.push(dehydratedAtom);
				} else {
					// This Atom value already exists, queue it for later hydration
					existingDehydratedAtoms.push(dehydratedAtom);
				}
			}

			if (newDehydratedAtoms.length > 0) {
				// It's actually fine to call this with state that already exists
				// in the registry, or is older. hydrate() is idempotent.
				Hydration.hydrate(registry, newDehydratedAtoms);
			}

			if (existingDehydratedAtoms.length > 0) {
				return existingDehydratedAtoms;
			}
		}
		return undefined;
	}, [registry, state]);

	useEffect(() => {
		if (hydrationQueue) {
			Hydration.hydrate(registry, hydrationQueue);
		}
	}, [registry, hydrationQueue]);

	return <>{children}</>;
};
