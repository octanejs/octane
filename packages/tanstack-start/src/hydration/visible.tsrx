// visible hydration strategy — port of @tanstack/react-start-client's
// hydration/visible.tsx. Fully self-contained fast path (no shared gate
// registry): a per-instance promise gate resolved by an IntersectionObserver.
// `reactUse` feature-detection is dropped — octane's `use` always exists.
//
// OCTANE ADAPTATION: upstream's VisibleHydrate is bare-called as a method
// (`props.when._h(props)`) with the strategy as `this`, running its hooks on
// the caller's fiber. Octane's compiled components take the
// `(props, __s, __extra)` ABI and cannot be bare-called, so octane's `Hydrate`
// renders `_h` as a child component and VisibleHydrate derives its strategy
// from `props.when` instead of `this` (resolving a function-valued `when` per
// render, exactly as upstream's Hydrate does).
import { Suspense, use, useEffect, useRef, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { isServer } from '@tanstack/router-core/isServer';
import type {
	HydrationPrefetchStrategy,
	VisibleHydrationOptions,
} from '@tanstack/start-client-core/hydration';
import type { HydrateProps, InternalHydrateProps, OctaneHydrationStrategy } from '../Hydrate.tsrx';

type VisibleGate = {
	p: Promise<void>;
	r: boolean;
	s: () => void;
};

function HydrationBoundary(props: { g: VisibleGate; o?: () => void; children?: OctaneNode }) {
	const { g, o } = props;

	if (!g.r) {
		use(g.p);
	}

	useEffect(() => {
		o?.();
	}, [o]);

	return props.children;
}

export function VisibleHydrate(props: HydrateProps) @{
	const when = props.when;
	const strategy = (typeof when === 'function' ? when() : when) as OctaneHydrationStrategy<
		'visible',
		true
	>;
	const prefetchStrategy = props.prefetch;
	const preload = (props as InternalHydrateProps).p;
	const markerRef = useRef<HTMLDivElement | null>(null);
	const [gate] = useState<VisibleGate>(() => {
		let resolvePromise: () => void;
		const nextGate: VisibleGate = {
			p: new Promise<void>((resolve) => {
				resolvePromise = resolve;
			}),
			r: false,
			s: () => {
				nextGate.r = true;
				resolvePromise();
			},
		};
		if (isServer ?? typeof window === 'undefined') {
			nextGate.s();
		}

		return nextGate;
	});

	useEffect(() => {
		if (!preload || typeof prefetchStrategy === 'function') {
			return;
		}

		return prefetchStrategy?._s?.({
			element: markerRef.current,
			prefetch: preload,
		});
	}, [prefetchStrategy, preload]);

	useEffect(() => {
		if (gate.r) return;

		return strategy._s?.({
			element: markerRef.current,
			gate: gate as never,
		});
	}, [gate, strategy]);

	<div ref={markerRef}>
		<Suspense fallback={props.fallback}>
			<HydrationBoundary g={gate} o={props.onHydrated}>{props.children}</HydrationBoundary>
		</Suspense>
	</div>
}

/* @__NO_SIDE_EFFECTS__ */
export function visible(
	options?: VisibleHydrationOptions,
): OctaneHydrationStrategy<'visible', true> & HydrationPrefetchStrategy<'visible'> {
	const rootMargin = options?.rootMargin ?? '600px';
	const threshold = options?.threshold ?? 0;

	return {
		_s: ({ element, gate, prefetch }) => {
			const callback = prefetch || (gate as never as VisibleGate).s;

			if (!element) {
				callback();
				return;
			}

			const observer = new IntersectionObserver((entries) => {
				if (!entries[0]!.isIntersecting) return;
				observer.disconnect();
				callback();
			}, { rootMargin, threshold });
			observer.observe(element);
			return () => observer.disconnect();
		},
		_h: VisibleHydrate,
	};
}
