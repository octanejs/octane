// react-router's CatchBoundary, rebuilt on octane's
// `@try`/`@catch` (octane has no class components, so the upstream
// CatchBoundaryImpl class becomes a catch branch). Contract preserved from
// upstream CatchBoundary.tsx:
//   - renders `children` until a descendant throws during render/effects;
//   - then renders `errorComponent` with `{ error, reset }`;
//   - `onCatch(error, errorInfo)` fires once per caught error (componentDidCatch
//     parity). It runs during the catch-branch render — BEFORE the error UI — so
//     an onCatch that rethrows (Match forwards `notFound()` errors this way)
//     propagates to the parent boundary exactly like a throwing componentDidCatch;
//   - when `getResetKey()` changes while an error is showing, the boundary resets
//     and re-renders `children` (upstream clears the error in
//     getDerivedStateFromProps; here a layout effect calls the catch reset — one
//     commit later, same observable outcome). Match passes the router's `loadedAt`
//     so navigation clears route error UI.
import { useRef, useLayoutEffect } from 'octane';
import type { OctaneNode } from 'octane';
import type { ErrorInfo, ErrorRouteComponent } from './route.ts';
import { ErrorComponent } from './ErrorComponent.tsrx';

export { ErrorComponent };

export function CatchBoundary(props: {
	getResetKey: () => unknown;
	children: OctaneNode;
	errorComponent?: ErrorRouteComponent;
	onCatch?: (error: Error, errorInfo: ErrorInfo) => void;
}) @{
	@try {
		<>{props.children}</>
	} @catch (error, reset) {
		<CatchErrorView
			error={error}
			reset={reset}
			getResetKey={props.getResetKey}
			errorComponent={props.errorComponent}
			onCatch={props.onCatch}
		/>
	}
}

function CatchErrorView(props: {
	error: any;
	reset: () => void;
	getResetKey?: () => unknown;
	errorComponent?: ErrorRouteComponent;
	onCatch?: (error: Error, errorInfo: ErrorInfo) => void;
}) @{
	// componentDidCatch parity — once per distinct caught error, during render so a
	// rethrow (the notFound-forwarding path) escapes to the parent boundary.
	const reported = useRef<unknown>(null);
	if (reported.current !== props.error) {
		reported.current = props.error;
		if (props.onCatch) props.onCatch(props.error, { componentStack: '' });
	}

	// Reset when the reset key rolls (navigation). Skip the mount render — the key
	// captured while catching is the baseline.
	const resetKey = props.getResetKey ? props.getResetKey() : undefined;
	const keyRef = useRef(resetKey);
	useLayoutEffect(() => {
		if (keyRef.current !== resetKey) {
			keyRef.current = resetKey;
			props.reset();
		}
	}, [resetKey]);

	const ErrorComp = props.errorComponent ?? ErrorComponent;

	<ErrorComp error={props.error} reset={props.reset} info={{ componentStack: '' }} />
}
