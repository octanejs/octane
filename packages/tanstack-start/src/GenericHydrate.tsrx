// GenericHydrate — port of @tanstack/react-start-client's GenericHydrate.tsx.
// The shared renderer behind the `idle` / `media` / `condition` / `interaction`
// strategies (and dynamic `when` functions): it renders the hydration marker
// `<div>` and gates the children behind a Suspense boundary whose promise is
// the strategy's hydration gate (`use(gate.promise)`), so deferred subtrees
// stay dehydrated until the strategy resolves the gate. All gate bookkeeping,
// delegated-intent listening, and prefetch waiting delegate to the
// framework-agnostic `@tanstack/start-client-core/hydration` runtime, exactly
// as upstream does. `reactUse` feature-detection is dropped: octane's `use`
// always exists. Upstream's SSR-safe `useLayoutEffect` re-export from
// `@tanstack/react-router` maps to octane's own `useLayoutEffect` (octane's
// server runtime ignores effects, so no SSR warning shim is needed).
//
// OCTANE ADAPTATION: upstream invokes strategy renderers inline
// (`props.when._h(props)` runs the renderer's hooks on the caller's fiber).
// Octane's compiled components take the `(props, __s, __extra)` ABI and cannot
// be bare-called, so octane's `Hydrate` renders `_h` as a child component
// instead — `GenericHydrate` is that component. Same DOM and effects; the
// hooks live in their own component scope rather than Hydrate's.
import {
	Suspense,
	use,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from 'octane';
import type { OctaneNode } from 'octane';
import { useHydrated } from '@octanejs/tanstack-router';
import { isServer } from '@tanstack/router-core/isServer';
import {
	hydrateIdAttribute,
	hydrateWhenAttribute,
} from '@tanstack/start-client-core/hydration/constants';
import {
	createResolvedGate,
	getFallbackHtml,
	getOrCreateGate,
	onGateResolve,
	releaseGate,
	runHydrationStrategyCleanup,
	saveFallbackHtml,
	waitForHydrationPrefetchStrategy,
} from '@tanstack/start-client-core/hydration/runtime';
import { listenForDelegatedHydrationIntent } from '@tanstack/start-client-core/hydration';
import type {
	HydrationRuntimeContext,
	HydrationStrategy,
	HydrationWhen,
} from '@tanstack/start-client-core/hydration';
import type { HydrationGateRecord } from '@tanstack/start-client-core/hydration/runtime';
import type { HydrateProps, InternalHydrateProps } from './Hydrate.tsrx';

type Gate = HydrationGateRecord & { promise: Promise<void> };
type PrefetchController = {
	abortController: AbortController;
	hydrationRequested: boolean;
	hydrationListeners: Set<() => void>;
	hydrationResolvePending: boolean;
	started: boolean;
	promise?: Promise<void>;
	cleanup?: () => void;
};

const dynamicType = 'dynamic';
const dynamicHydrateStrategy: HydrationStrategy<typeof dynamicType, false> = {
	_t: dynamicType,
	_d: () => true,
};

function shouldDeferHydration(strategy: HydrationStrategy) {
	return strategy._d ? strategy._d() : strategy._t !== 'load';
}

function useLatest<T>(value: T) {
	const ref = useRef(value);
	ref.current = value;
	return ref;
}

function useHydrationGate(props: InternalHydrateProps) {
	const hydrated = useHydrated();
	const octaneId = useId();
	const id = props.h ? `${props.h}${octaneId}` : octaneId;
	const when = props.when;
	const isDynamicHydrate = typeof when === 'function';
	const dynamicHydrateStrategyRef = useRef<HydrationStrategy | undefined>(undefined);
	if (isDynamicHydrate) {
		dynamicHydrateStrategyRef.current ??= isServer ?? typeof window === 'undefined'
			? dynamicHydrateStrategy
			: when();
	}
	const hydrateStrategy = isDynamicHydrate ? dynamicHydrateStrategyRef.current! : when;
	const markerHydrateType: HydrationWhen = isDynamicHydrate ? dynamicType : hydrateStrategy._t!;
	const [prefetchError, setPrefetchError] = useState<unknown>();
	const latestRef = useLatest({
		prefetch: props.prefetch,
		preload: props.p,
	});
	const gateRef = useRef<HydrationGateRecord | undefined>(undefined);
	const markerElementRef = useRef<HTMLDivElement | null>(null);
	const shouldPreserveServerHTMLRef = useRef<boolean | undefined>(undefined);
	const shouldDeferInitialHydrationRef = useRef<boolean | undefined>(undefined);
	const didPrefetchRef = useRef(false);
	const prefetchControllerRef = useRef<PrefetchController | undefined>(undefined);

	prefetchControllerRef.current ??= {
		abortController: new AbortController(),
		hydrationRequested: false,
		hydrationListeners: new Set<() => void>(),
		hydrationResolvePending: false,
		started: false,
	};

	shouldPreserveServerHTMLRef.current ??= (isServer ?? typeof window === 'undefined') || !hydrated;
	shouldDeferInitialHydrationRef.current ??= !hydrated && shouldDeferHydration(hydrateStrategy);

	if (!gateRef.current) {
		gateRef.current = isServer ?? typeof window === 'undefined'
			? createResolvedGate(id, hydrateStrategy._t!)
			: getOrCreateGate(id, hydrateStrategy._t!);
	}

	gateRef.current.when = hydrateStrategy._t!;

	if (
		!(isServer ?? typeof window === 'undefined') && hydrateStrategy._t !== 'never' &&
			(!shouldDeferInitialHydrationRef.current || !shouldDeferHydration(hydrateStrategy))
	) {
		gateRef.current.resolve();
	}

	const markerRef = useCallback((element: HTMLDivElement | null) => {
		markerElementRef.current = element;
		if (element) {
			if (hydrateStrategy._t === 'never' && !shouldPreserveServerHTMLRef.current) {
				element.replaceChildren();
			}
			saveFallbackHtml(id, element);
		}
	}, [hydrateStrategy._t, id]);

	useEffect(() => {
		const gate = gateRef.current!;
		return () => {
			const controller = prefetchControllerRef.current;
			controller?.abortController.abort();
			controller?.cleanup?.();
			controller?.hydrationListeners.clear();
			releaseGate(gate);
		};
	}, []);

	useEffect(() => {
		if ((isServer ?? typeof window === 'undefined') || !latestRef.current.prefetch) {
			return;
		}

		const controller = prefetchControllerRef.current!;
		if (controller.started) return;
		controller.started = true;

		const onHydrate = (listener: () => void) => {
			if (controller.hydrationRequested) {
				listener();
				return () => {};
			}

			controller.hydrationListeners.add(listener);
			return () => {
				controller.hydrationListeners.delete(listener);
			};
		};

		const preload = () => latestRef.current.preload?.() ?? Promise.resolve();
		const prefetchInput = latestRef.current.prefetch;

		if (typeof prefetchInput === 'function') {
			const promise = Promise.resolve().then(
				() => prefetchInput({
					element: markerElementRef.current,
					signal: controller.abortController.signal,
					preload,
					waitFor: (strategy) => waitForHydrationPrefetchStrategy(strategy, {
						element: markerElementRef.current,
						signal: controller.abortController.signal,
						onHydrate,
					}),
				}),
			).then(() => undefined);

			controller.promise = promise;
			promise.catch((error) => {
				if (!controller.abortController.signal.aborted) {
					setPrefetchError(error);
				}
			});
			return;
		}

		if (!latestRef.current.preload) return;

		const prefetch = () => {
			if (didPrefetchRef.current) return;
			didPrefetchRef.current = true;
			void preload();
		};

		controller.cleanup = runHydrationStrategyCleanup(
			prefetchInput._s?.({
				element: markerElementRef.current,
				prefetch,
			}),
		);
	}, [hydrateStrategy, latestRef]);

	useLayoutEffect(() => {
		const gate = gateRef.current!;
		if (!shouldDeferInitialHydrationRef.current || hydrateStrategy._t === 'never') {
			return;
		}

		if (gate.resolved) {
			return;
		}

		const cleanups: Array<() => void> = [];
		let removeResolveListener = () => {};
		let disposed = false;
		const resolveGate = gate.resolve;

		const cleanup = () => {
			if (disposed) return;
			disposed = true;
			if (gate.resolve === requestHydration) {
				gate.resolve = resolveGate;
			}
			removeResolveListener();
			cleanups.forEach((fn) => fn());
		};

		const addCleanup = (fn: void | (() => void)) => {
			if (!fn) return;
			if (disposed || gate.resolved) {
				fn();
				return;
			}
			cleanups.push(fn);
		};

		const requestHydration = () => {
			const controller = prefetchControllerRef.current!;
			if (!controller.hydrationRequested) {
				controller.hydrationRequested = true;
				controller.hydrationListeners.forEach((listener) => listener());
				controller.hydrationListeners.clear();
			}

			if (!controller.promise) {
				resolveGate();
				return;
			}
			if (controller.hydrationResolvePending) return;
			controller.hydrationResolvePending = true;

			controller.promise.then(() => resolveGate(), (error) => {
				if (!controller.abortController.signal.aborted) {
					setPrefetchError(error);
				}
			});
		};

		gate.resolve = requestHydration;
		removeResolveListener = onGateResolve(gate, cleanup);

		const context: HydrationRuntimeContext = {
			element: markerElementRef.current,
			gate,
		};
		addCleanup(runHydrationStrategyCleanup(hydrateStrategy._s?.(context)));

		if (hydrateStrategy._t !== 'interaction') {
			addCleanup(
				runHydrationStrategyCleanup(
					markerElementRef.current
						? listenForDelegatedHydrationIntent(markerElementRef.current, context)
						: undefined,
				),
			);
		}

		return cleanup;
	}, [hydrateStrategy, latestRef]);

	return {
		gate: gateRef.current,
		markerRef,
		markerElementRef,
		hydrateStrategy,
		markerHydrateType,
		prefetchError,
		shouldPreserveServerHTML: shouldPreserveServerHTMLRef.current,
	};
}

function HydrationGate(props: { gate: Gate; children?: OctaneNode }) {
	if (isServer ?? typeof window === 'undefined') {
		return props.children;
	}

	if (props.gate.resolved) {
		return props.children;
	}

	use(props.gate.promise);

	return props.children;
}

function HydratedBoundary(props: {
	id: string;
	onHydrated?: () => void;
	onStrategyHydrated?: (id: string) => void;
	children?: OctaneNode;
}) {
	const { id, onHydrated, onStrategyHydrated } = props;
	const didHydrateRef = useRef(false);

	useEffect(() => {
		if (didHydrateRef.current) return;
		didHydrateRef.current = true;
		onHydrated?.();
		onStrategyHydrated?.(id);
	}, [id, onHydrated, onStrategyHydrated]);

	return props.children;
}

export function GenericHydrate(props: HydrateProps) @{
	const internalProps = props as InternalHydrateProps;
	const {
		gate,
		hydrateStrategy,
		markerHydrateType,
		markerElementRef,
		markerRef,
		prefetchError,
		shouldPreserveServerHTML,
	} = useHydrationGate(internalProps);
	if (prefetchError) throw prefetchError;

	let fallback: OctaneNode;
	if (shouldPreserveServerHTML) {
		const html = getFallbackHtml(gate.id);
		fallback = html
			? <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />
			: null;
	} else {
		fallback = props.fallback ?? null;
	}
	const markerAttributes =
		markerHydrateType === dynamicType ? undefined : hydrateStrategy._a?.();

	const hydrateType = hydrateStrategy._t!;
	const preserveNever = hydrateType === 'never' && !shouldPreserveServerHTML;

	<div
		ref={markerRef}
		{...{
			[hydrateIdAttribute]: gate.id,
			[hydrateWhenAttribute]: markerHydrateType,
			...markerAttributes,
		}}
	>
		@if (preserveNever) {
			<>
				{props.fallback ?? null}
			</>
		} @else {
			<Suspense fallback={fallback}>
				<HydrationGate gate={gate as Gate}>
					<HydratedBoundary
						id={gate.id}
						onHydrated={props.onHydrated}
						onStrategyHydrated={(id) => {
							markerElementRef.current?.removeAttribute(hydrateWhenAttribute);
							hydrateStrategy._o?.(id);
						}}
					>{props.children}</HydratedBoundary>
				</HydrationGate>
			</Suspense>
		}
	</div>
}
