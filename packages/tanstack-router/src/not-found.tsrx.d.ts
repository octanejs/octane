// Type declaration for the .tsrx components (resolved by relative path).
import type { NotFoundError } from '@tanstack/router-core';
import type { ErrorInfo } from './route';

export declare const CatchNotFound: (props: {
	fallback?: (error: NotFoundError) => unknown;
	onCatch?: (error: Error, errorInfo: ErrorInfo) => void;
	children?: unknown;
}) => unknown;
export declare const DefaultGlobalNotFound: () => unknown;
