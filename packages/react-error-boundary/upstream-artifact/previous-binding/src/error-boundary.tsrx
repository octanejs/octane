import { ErrorBoundary as NativeErrorBoundary, useCallback, useLayoutEffect, useRef } from 'octane';
import type { OctaneNode } from 'octane';
import { ErrorBoundaryContext } from './context.ts';
import type { ErrorBoundaryProps, FallbackProps } from './types.ts';

export function ErrorBoundary(props: ErrorBoundaryProps) @{
	const nativeResetRef = useRef<(() => void) | null>(null);
	const caughtRef = useRef(false);
	const propsRef = useRef(props);
	propsRef.current = props;
	caughtRef.current = false;
	const resetErrorBoundary = useCallback((...args: unknown[]) => {
		if (!caughtRef.current) return;
		propsRef.current.onReset?.({ args, reason: 'imperative-api' });
		caughtRef.current = false;
		nativeResetRef.current?.();
	}, []);
	const idleContext = {
		didCatch: false,
		error: null,
		resetErrorBoundary,
	};

	<NativeErrorBoundary
		resetRef={nativeResetRef}
		fallback={(error: unknown) =>
			<CaughtError
				error={error}
				reset={nativeResetRef.current!}
				resetErrorBoundary={resetErrorBoundary}
				caughtRef={caughtRef}
				propsRef={propsRef}
			/>}
	>
		<ErrorBoundaryContext.Provider
			value={idleContext}
		>{props.children}</ErrorBoundaryContext.Provider>
	</NativeErrorBoundary>
}

function CaughtError(props: {
	error: unknown;
	reset: () => void;
	resetErrorBoundary: (...args: unknown[]) => void;
	caughtRef: { current: boolean };
	propsRef: { current: ErrorBoundaryProps };
}) @{
	props.caughtRef.current = true;
	const unreported = useRef(true);
	useLayoutEffect(() => {
		if (unreported.current) {
			unreported.current = false;
			props.propsRef.current.onError?.(props.error, { componentStack: '' });
		}
	}, [props.error]);

	const resetKeys = props.propsRef.current.resetKeys;
	const previousResetKeys = useRef(resetKeys);

	useLayoutEffect(() => {
		const previous = previousResetKeys.current;
		if (hasArrayChanged(previous, resetKeys)) {
			previousResetKeys.current = resetKeys;
			props.propsRef.current.onReset?.({
				next: resetKeys,
				prev: previous,
				reason: 'keys',
			});
			props.caughtRef.current = false;
			props.reset();
		}
	}, [resetKeys]);

	const fallbackProps: FallbackProps = {
		error: props.error,
		resetErrorBoundary: props.resetErrorBoundary,
	};
	const context = {
		didCatch: true,
		error: props.error,
		resetErrorBoundary: props.resetErrorBoundary,
	};
	const boundaryProps = props.propsRef.current;
	const FallbackComponent = boundaryProps.FallbackComponent;
	let fallback: OctaneNode;
	if (boundaryProps.fallbackRender) {
		fallback = boundaryProps.fallbackRender(fallbackProps);
	} else if (FallbackComponent) {
		fallback = <FallbackComponent {...fallbackProps} />;
	} else if (boundaryProps.fallback !== undefined) {
		fallback = boundaryProps.fallback;
	} else {
		throw props.error;
	}

	<ErrorBoundaryContext.Provider value={context}>{fallback}</ErrorBoundaryContext.Provider>
}

function hasArrayChanged(a: unknown[] = [], b: unknown[] = []): boolean {
	return a.length !== b.length || a.some((item, index) => !Object.is(item, b[index]));
}
