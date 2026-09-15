declare const process: { env: { NODE_ENV?: string } };

import { ErrorBoundary as NativeErrorBoundary, createElement, useState, useRef } from 'octane';
import type { OctaneNode } from 'octane';
import type { ErrorInfo, ErrorRouteComponent } from './route.ts';
import { wrapInNonRouteComponentContext } from './nonRouteComponentContext.ts';

export function CatchBoundary(props: {
	getResetKey: () => unknown;
	children: OctaneNode;
	errorComponent?: ErrorRouteComponent;
	onCatch?: (error: unknown, errorInfo: ErrorInfo) => void;
}) @{
	const resetKey = props.getResetKey();
	const caught = useRef<{ key: unknown; reset: () => void } | null>(null);
	// Clear the prior error before the native boundary renders changed props.
	// Deferring this to the fallback's layout effect can render a new route's
	// error component with the previous route's error for one commit.
	if (caught.current && !Object.is(caught.current.key, resetKey)) {
		const previous = caught.current;
		caught.current = null;
		previous.reset();
	}
	<NativeErrorBoundary
		fallback={(error: unknown, reset: () => void) => {
			caught.current = { key: resetKey, reset };
			return <CatchErrorView
				error={error}
				reset={reset}
				errorComponent={props.errorComponent}
				onCatch={props.onCatch}
			/>;
		}}
	>{props.children}</NativeErrorBoundary>
}

function CatchErrorView(props: {
	error: unknown;
	reset: () => void;
	errorComponent?: ErrorRouteComponent;
	onCatch?: (error: unknown, errorInfo: ErrorInfo) => void;
}) @{
	// componentDidCatch parity — once per distinct caught error, during render so a
	// rethrow (the notFound-forwarding path) escapes to the parent boundary.
	const reported = useRef<[unknown] | undefined>(undefined);
	if (!reported.current || !Object.is(reported.current[0], props.error)) {
		reported.current = [props.error];
		if (props.onCatch) props.onCatch(props.error, { componentStack: '' });
	}

	const ErrorComp = props.errorComponent ?? ErrorComponent;

	const element = createElement(ErrorComp, {
		error: props.error,
		reset: props.reset,
		info: { componentStack: '' },
	});
	<>
		{process.env.NODE_ENV !== 'production'
			? wrapInNonRouteComponentContext(element, 'errorComponent')
			: element}
	</>
}

// The default error UI, markup-identical to react-router's ErrorComponent (string
// styles serialize to the same inline css React produces, so the differential rig
// can byte-compare it).
export function ErrorComponent(props: {
	error: unknown;
	reset?: () => void;
	info?: { componentStack?: string };
}) @{
	const [show, setShow] = useState(process.env.NODE_ENV !== 'production');
	const message =
		props.error && (typeof props.error === 'object' || typeof props.error === 'function') &&
		'message' in props.error
			? props.error.message
			: undefined;

	<div style="padding:.5rem;max-width:100%">
		<div style="display:flex;align-items:center;gap:.5rem">
			<strong style="font-size:1rem">Something went wrong!</strong>
			<button
				style="appearance:none;font-size:.6em;border:1px solid currentColor;padding:.1rem .2rem;font-weight:bold;border-radius:.25rem"
				onClick={() => setShow((d) => !d)}
			>
				{show ? 'Hide Error' : 'Show Error'}
			</button>
		</div>
		<div style="height:.25rem"></div>
		@if (show) {
			<div>
				<pre
					style="font-size:.7em;border:1px solid red;border-radius:.25rem;padding:.3rem;color:red;overflow:auto"
				>
					@if (message) {
						<code>{message as string}</code>
					}
				</pre>
			</div>
		}
	</div>
}
