import type { ComponentBody, OctaneNode } from 'octane';

export type FallbackProps = {
	error: unknown;
	resetErrorBoundary: (...args: unknown[]) => void;
};

export type OnErrorCallback = (error: unknown, info: { componentStack: string }) => void;

type ErrorBoundarySharedProps = {
	children?: OctaneNode;
	onError?: OnErrorCallback;
	onReset?: (
		details:
			| { args: unknown[]; reason: 'imperative-api' }
			| { next: unknown[] | undefined; prev: unknown[] | undefined; reason: 'keys' },
	) => void;
	resetKeys?: unknown[];
};

export type ErrorBoundaryPropsWithComponent = ErrorBoundarySharedProps & {
	fallback?: never;
	FallbackComponent: ComponentBody<FallbackProps>;
	fallbackRender?: never;
};

export type ErrorBoundaryPropsWithRender = ErrorBoundarySharedProps & {
	fallback?: never;
	FallbackComponent?: never;
	fallbackRender: (props: FallbackProps) => OctaneNode;
};

export type ErrorBoundaryPropsWithFallback = ErrorBoundarySharedProps & {
	fallback: OctaneNode;
	FallbackComponent?: never;
	fallbackRender?: never;
};

export type ErrorBoundaryProps =
	ErrorBoundaryPropsWithFallback | ErrorBoundaryPropsWithComponent | ErrorBoundaryPropsWithRender;

export type ErrorBoundaryContextType = {
	didCatch: boolean;
	error: unknown | null;
	resetErrorBoundary: (...args: unknown[]) => void;
};

export type ComponentType<P = {}> = ComponentBody<P> & {
	displayName?: string;
	name?: string;
};
