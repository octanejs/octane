// never hydration strategy — port of @tanstack/react-start-client's
// hydration/never.tsx. Server HTML is preserved verbatim and the subtree is
// never hydrated: the gate promise never resolves, so the Suspense boundary
// keeps showing the saved server HTML (re-injected via dangerouslySetInnerHTML)
// forever. `reactUse` feature-detection is dropped — octane's `use` always
// exists.
import { Suspense, use, useCallback, useId, useRef } from 'octane';
import type { OctaneNode } from 'octane';
import { useHydrated } from '@octanejs/tanstack-router';
import { isServer } from '@tanstack/router-core/isServer';
import { never as coreNever, withHydrationRenderer } from '@tanstack/start-client-core/hydration';
import {
	hydrateIdAttribute,
	hydrateWhenAttribute,
} from '@tanstack/start-client-core/hydration/constants';
import { getFallbackHtml, saveFallbackHtml } from '@tanstack/start-client-core/hydration/runtime';
import type { HydrateProps, InternalHydrateProps } from '../Hydrate.tsrx';

const neverType = 'never';
const neverPromise = new Promise<void>(() => {});

function NeverGate(props: { children?: OctaneNode }) {
	if (isServer ?? typeof window === 'undefined') {
		return props.children;
	}

	use(neverPromise);

	return props.children;
}

// OCTANE ADAPTATION: octane's `Hydrate` renders `_h` as a child component
// (upstream bare-calls it inline); NeverHydrate is that component.
export function NeverHydrate(props: HydrateProps) @{
	const internalProps = props as InternalHydrateProps;
	const hydrated = useHydrated();
	const octaneId = useId();
	const id = internalProps.h ? `${internalProps.h}${octaneId}` : octaneId;
	const shouldPreserveServerHTMLRef = useRef<boolean | undefined>(undefined);
	shouldPreserveServerHTMLRef.current ??= (isServer ?? typeof window === 'undefined') || !hydrated;
	const markerRef = useCallback((element: HTMLDivElement | null) => {
		if (!element) return;
		if (!shouldPreserveServerHTMLRef.current) {
			element.replaceChildren();
		} else {
			saveFallbackHtml(id, element);
		}
	}, [id]);
	const savedHtml = getFallbackHtml(id);

	<div
		ref={markerRef}
		{...{
			[hydrateIdAttribute]: id,
			[hydrateWhenAttribute]: neverType,
		}}
	>
		<Suspense
			fallback={savedHtml
				? <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: savedHtml }} />
				: props.fallback ?? null}
		>
			<NeverGate>{props.children}</NeverGate>
		</Suspense>
	</div>
}

/* @__NO_SIDE_EFFECTS__ */
export function never() {
	return /* @__PURE__ */ withHydrationRenderer(coreNever(), NeverHydrate);
}
