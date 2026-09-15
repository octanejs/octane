// Type declaration for the .tsrx components (resolved by relative path).
import type { ErrorInfo, ErrorRouteComponent } from './route';

export declare const CatchBoundary: (props: {
	getResetKey: () => unknown;
	errorComponent?: ErrorRouteComponent;
	onCatch?: (error: unknown, errorInfo: ErrorInfo) => void;
	children?: unknown;
}) => unknown;
export declare const ErrorComponent: (props: {
	error: unknown;
	reset?: () => void;
	info?: { componentStack?: string };
}) => unknown;
