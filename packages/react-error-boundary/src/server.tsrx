import { ErrorBoundary as NativeErrorBoundary } from 'octane';
import type { OctaneNode } from 'octane';
import { ErrorBoundaryContext } from './context.ts';
import type { ComponentType, ErrorBoundaryHandle, ErrorBoundaryProps } from './types.ts';

export type ErrorBoundary = ErrorBoundaryHandle;

// Keep the client boundary's hydration structure while propagating server errors.
// Upstream never renders a fallback during server rendering.
export function ErrorBoundary(props: ErrorBoundaryProps) @{
	<NativeErrorBoundary
		fallback={(error: unknown) => {
			throw error;
		}}
	>
		<ErrorBoundaryContext.Provider
			value={{ didCatch: false, error: null, resetErrorBoundary: () => {} }}
		>{props.children as OctaneNode}</ErrorBoundaryContext.Provider>
	</NativeErrorBoundary>
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
