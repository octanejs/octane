// Await — port of react-router@8.2.0 lib/components.tsx's Await +
// AwaitErrorBoundary + ResolveAwait onto octane. The class boundary becomes an
// octane @try/@catch; the "throw to the suspense boundary" becomes use(promise)
// (octane's suspend primitive); the TrackedPromise decoration (_tracked/_data/
// _error defineProperty) is kept verbatim so useAsyncValue/useAsyncError and
// AwaitContext consumers stay upstream-identical.
//
// Boundary layering (upstream parity): a class boundary does NOT catch its own
// render throws, so the no-errorElement rethrow (bubble to the ROUTE boundary)
// and the pending suspension live in AwaitBody, OUTSIDE Await's render-error
// catch; the @try/@catch wraps only the CHILDREN render (what upstream's
// componentDidCatch actually sees).
import { use, useCallback, useContext, useRef, isChildrenBlock } from 'octane';
import { AwaitContext, DataRouterContext, DataRouterStateContext } from './context.ts';
import { getRoutePattern } from './router/utils.ts';

// NOTE: children are forwarded in PROP position (children={...}) through the
// internal layers — a JSX `{props.children}` child would be re-wrapped into an
// octane children BLOCK at each hop, destroying the render-prop identity the
// isChildrenBlock guard in ResolveAwait relies on.
export function Await(props) @{
	const dataRouterContext = useContext(DataRouterContext);
	const dataRouterStateContext = useContext(DataRouterStateContext);

	const onError = useCallback((error, errorInfo) => {
		if (dataRouterContext && dataRouterContext.onError && dataRouterStateContext) {
			dataRouterContext.onError(error, {
				location: dataRouterStateContext.location,
				params: dataRouterStateContext.matches[0]?.params || {},
				pattern: getRoutePattern(dataRouterStateContext.matches),
				errorInfo,
			});
		}
	}, [dataRouterContext, dataRouterStateContext]);

	<AwaitBody
		resolve={props.resolve}
		errorElement={props.errorElement}
		onError={onError}
		children={props.children}
	/>
}

function AwaitBody(props) @{
	// Upstream AwaitErrorBoundary.render() tracking logic, verbatim.
	let promise;
	let status = 'pending';

	if (!(props.resolve instanceof Promise)) {
		// Didn't get a promise - provide as a resolved promise
		status = 'success';
		promise = Promise.resolve();
		Object.defineProperty(promise, '_tracked', { get: () => true });
		Object.defineProperty(promise, '_data', { get: () => props.resolve });
	} else if (props.resolve._tracked) {
		// Already tracked promise - check contents
		promise = props.resolve;
		status = '_error' in promise ? 'error' : '_data' in promise ? 'success' : 'pending';
	} else {
		// Raw (untracked) promise - track it
		status = 'pending';
		const resolve = props.resolve;
		Object.defineProperty(resolve, '_tracked', { get: () => true });
		promise = resolve.then((data) => Object.defineProperty(resolve, '_data', { get: () => data }), (
			error,
		) => {
			// Log promise rejections
			props.onError?.(error);
			Object.defineProperty(resolve, '_error', { get: () => error });
		});
	}

	if (status === 'error' && !props.errorElement) {
		// No errorElement, throw to the nearest route-level error boundary.
		// (Outside the children @try below — a boundary never catches its own
		// render throw, upstream parity.)
		throw props.resolve._error;
	}

	if (status === 'pending') {
		// Suspend to the nearest boundary; the replay re-enters with
		// _data/_error defined. use() is octane's suspend primitive (upstream
		// throws the promise).
		use(promise);
	}

	@if (status === 'error') {
		<AwaitContext.Provider value={promise}>{props.errorElement}</AwaitContext.Provider>
	} @else {
		@try {
			<AwaitContext.Provider value={promise}>
				<ResolveAwait children={props.children} />
			</AwaitContext.Provider>
		} @catch (caught, reset) {
			<AwaitCaught caught={caught} errorElement={props.errorElement} onError={props.onError} />
		}
	}
}

// A render error from the children — upstream's getDerivedStateFromError turns
// it into a rejected tracked promise rendered through errorElement (or
// rethrown when there is none).
function AwaitCaught(props) @{
	// componentDidCatch parity — once per distinct caught error, during render.
	const reported = useRef(null);
	if (reported.current !== props.caught) {
		reported.current = props.caught;
		if (props.onError) {
			props.onError(props.caught, { componentStack: '' });
		} else {
			console.error('<Await> caught the following error during render', props.caught, {
				componentStack: '',
			});
		}
	}

	if (!props.errorElement) {
		// Rethrow from the catch branch → propagates to the parent boundary.
		throw props.caught;
	}

	const renderError = props.caught;
	const promise = Promise.reject().catch(() => {}); // Avoid unhandled rejection warnings
	Object.defineProperty(promise, '_tracked', { get: () => true });
	Object.defineProperty(promise, '_error', { get: () => renderError });

	<AwaitContext.Provider value={promise}>{props.errorElement}</AwaitContext.Provider>
}

// Indirection to leverage useAsyncValue for a render-prop API on `<Await>`.
// (useAsyncValue inlined via AwaitContext to keep this file free of a hooks.ts
// dependency; identical semantics.)
function ResolveAwait(props) @{
	const value = useContext(AwaitContext);
	const data = value?._data;
	// Render-prop guard: octane children BLOCKS are functions too — only a real
	// user render-prop gets called (isChildrenBlock idiom).
	const toRender =
		typeof props.children === 'function' && !isChildrenBlock(props.children)
			? props.children(data)
			: props.children;
	<>
		{toRender}
	</>
}
