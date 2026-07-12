// RenderErrorBoundary — port of the class boundary in react-router@7.18.1
// lib/hooks.tsx onto octane's @try/@catch (octane has no class components).
// RSC digest branches are dropped (RSCRouterContext is hardwired false here).
//
// Upstream semantics reproduced:
// - getDerivedStateFromProps: the retained error resets when the location
//   changes or a revalidation returns to "idle"; otherwise a NEW props.error
//   surfaces while a stale one is retained even if app state cleared it.
// - getDerivedStateFromError: render errors thrown below become the error.
// - componentDidCatch → onError (or the upstream console.error) once per
//   distinct caught error, DURING the catch render — so a rethrow escapes to
//   the parent boundary.
// - Render: error !== undefined → RouteContext(routeContext) →
//   RouteErrorContext(error) → component; else children.
//
// Octane mapping: DATA errors (props.error, from router state.errors) never
// throw — the error branch renders directly. RENDER errors land in @catch;
// the catch view applies the same precedence (props.error wins) and leaves
// the catch state via reset() one commit after the location/revalidation
// derivation says the error cleared (documented divergence: upstream clears
// in a render-phase derivation; same observable outcome).
import { useRef, useLayoutEffect } from 'octane';
import { RouteContext, RouteErrorContext } from './context.ts';

export function RenderErrorBoundary(props) @{
	// getDerivedStateFromProps, run during render (pure derivation).
	const state = useRef({
		location: props.location,
		revalidation: props.revalidation,
		error: props.error,
	});
	{
		const s = state.current;
		if (
			s.location !== props.location || s.revalidation !== 'idle' && props.revalidation === 'idle'
		) {
			state.current = {
				error: props.error,
				location: props.location,
				revalidation: props.revalidation,
			};
		} else {
			state.current = {
				error: props.error !== undefined ? props.error : s.error,
				location: s.location,
				revalidation: props.revalidation || s.revalidation,
			};
		}
	}

	@try {
		@if (state.current.error !== undefined) {
			<RouteContext.Provider value={props.routeContext}>
				<RouteErrorContext.Provider
					value={state.current.error}
				>{props.component}</RouteErrorContext.Provider>
			</RouteContext.Provider>
		} @else {
			<>
				{props.children}
			</>
		}
	} @catch (caught, reset) {
		<CaughtErrorView
			caught={caught}
			reset={reset}
			error={props.error}
			location={props.location}
			revalidation={props.revalidation}
			routeContext={props.routeContext}
			component={props.component}
			onError={props.onError}
		/>
	}
}

function CaughtErrorView(props) @{
	// componentDidCatch parity — once per distinct caught error, during render
	// so a rethrowing onError escapes to the parent boundary.
	const reported = useRef(null);
	if (reported.current !== props.caught) {
		reported.current = props.caught;
		if (props.onError) {
			props.onError(props.caught, { componentStack: '' });
		} else {
			console.error('React Router caught the following error during render', props.caught);
		}
	}

	// Error precedence per upstream derivation: a defined props.error (data
	// error for this location) wins over the caught render error.
	const error =
		props.error !== undefined ? props.error : props.caught;

	// Leave the catch state when the location changes or a revalidation
	// completes — the octane analogue of upstream's render-phase reset.
	// `location` stays pinned at the catch baseline (upstream's state.location
	// only moves on reset), but `revalidation` must TRACK every render the way
	// upstream's derived state does (`props.revalidation || state.revalidation`)
	// — a render error is usually caught while revalidation is already "idle",
	// and the recovery signal is the SUBSEQUENT loading → idle transition, not
	// a transition relative to the frozen catch-time value.
	const baseline = useRef({ location: props.location, revalidation: props.revalidation });
	useLayoutEffect(() => {
		const b = baseline.current;
		const shouldReset =
			b.location !== props.location || b.revalidation !== 'idle' && props.revalidation === 'idle';
		b.revalidation = props.revalidation || b.revalidation;
		if (shouldReset) {
			props.reset();
		}
	}, [props.location, props.revalidation]);

	<RouteContext.Provider value={props.routeContext}>
		<RouteErrorContext.Provider value={error}>{props.component}</RouteErrorContext.Provider>
	</RouteContext.Provider>
}
