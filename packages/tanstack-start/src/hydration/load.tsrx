// load hydration strategy — port of @tanstack/react-start-client's
// hydration/load.tsx. `load` hydrates immediately, so its renderer skips the
// marker/gate machinery entirely: a bare Suspense wrapper plus an onHydrated
// notification effect.
import { Suspense, useEffect, useRef } from 'octane';
import type { OctaneNode } from 'octane';
import { load as coreLoad, withHydrationRenderer } from '@tanstack/start-client-core/hydration';
import type { HydrateProps } from '../Hydrate.tsrx';

function HydratedBoundary(props: { onHydrated?: () => void; children?: OctaneNode }) {
	const { onHydrated } = props;
	const didHydrateRef = useRef(false);

	useEffect(() => {
		if (didHydrateRef.current) return;
		didHydrateRef.current = true;
		onHydrated?.();
	}, [onHydrated]);

	return props.children;
}

// OCTANE ADAPTATION: octane's `Hydrate` renders `_h` as a child component
// (upstream bare-calls it inline); LoadHydrate is that component.
export function LoadHydrate(props: HydrateProps) @{
	<div>
		<Suspense fallback={props.fallback ?? null}>
			<HydratedBoundary onHydrated={props.onHydrated}>{props.children}</HydratedBoundary>
		</Suspense>
	</div>
}

const loadStrategy = /* @__PURE__ */ withHydrationRenderer(coreLoad(), LoadHydrate);

/* @__NO_SIDE_EFFECTS__ */
export function load() {
	return loadStrategy;
}
