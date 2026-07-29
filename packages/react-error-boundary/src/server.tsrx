import type { OctaneNode } from 'octane';
import { ErrorBoundaryContext } from './context.ts';
import type { ComponentType, ErrorBoundaryProps } from './types.ts';

// Upstream react-error-boundary does not catch errors during server rendering.
// This explicit server entry therefore renders children without installing
// Octane's native server boundary.
export function ErrorBoundary(props: ErrorBoundaryProps) @{
	<ErrorBoundaryContext.Provider
		value={{ didCatch: false, error: null, resetErrorBoundary: () => {} }}
	>{props.children as OctaneNode}</ErrorBoundaryContext.Provider>
}

export function withErrorBoundary<Props extends object>(
	BaseComponent: ComponentType<Props>,
	errorBoundaryProps: ErrorBoundaryProps,
): ComponentType<Props> {
	function WrappedComponent(props: Props) {
		return <ErrorBoundary {...errorBoundaryProps}>
			<BaseComponent {...props} />
		</ErrorBoundary>;
	}
	WrappedComponent.displayName = `withErrorBoundary(${
		BaseComponent.displayName || BaseComponent.name || 'Unknown'
	})`;
	return WrappedComponent;
}

export { useErrorBoundary } from './use-error-boundary.ts';
export { ErrorBoundaryContext };
export { getErrorMessage } from './utils.ts';
export type { ComponentType, ErrorBoundaryContextType, ErrorBoundaryProps, ErrorBoundaryPropsWithComponent, ErrorBoundaryPropsWithFallback, ErrorBoundaryPropsWithRender, FallbackProps, OnErrorCallback } from './types.ts';
export type { UseErrorBoundaryApi } from './use-error-boundary.ts';
