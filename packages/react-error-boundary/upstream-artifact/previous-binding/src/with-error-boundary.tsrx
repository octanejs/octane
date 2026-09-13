import type { ComponentType, ErrorBoundaryProps } from './types.ts';
import { ErrorBoundary } from './error-boundary.tsrx';

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
