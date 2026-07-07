// Type declaration for the .tsrx components (resolved by relative path).
export declare const CatchBoundary: (props: {
	getResetKey?: () => number | string;
	errorComponent?: unknown;
	onCatch?: (error: any, errorInfo: { componentStack: string }) => void;
	children?: unknown;
}) => unknown;
export declare const ErrorComponent: (props: { error: any; reset?: () => void }) => unknown;
