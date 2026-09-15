// Type declaration for the .tsrx components (resolved by relative path).
import type { ErrorInfo, ErrorRouteComponent } from './route';

export declare const CatchBoundary: (props: {
	getResetKey: () => number | string;
	errorComponent?: ErrorRouteComponent;
	onCatch?: (error: Error, errorInfo: ErrorInfo) => void;
	children?: unknown;
}) => unknown;
export declare const ErrorComponent: (props: {
	error: any;
	reset?: () => void;
	info?: { componentStack?: string };
}) => unknown;
