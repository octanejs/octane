import { createContext, useContext } from 'octane';

export interface QueryErrorResetBoundaryValue {
	clearReset: () => void;
	reset: () => void;
	isReset: () => boolean;
}

export function createValue(): QueryErrorResetBoundaryValue {
	let isReset = false;
	return {
		clearReset: () => {
			isReset = false;
		},
		reset: () => {
			isReset = true;
		},
		isReset: () => isReset,
	};
}

// The reset coordinator for error-boundary retries. While "reset", a thrown query
// error is NOT re-thrown (so the boundary's retry refetches instead of looping).
// The default value means: without a `<QueryErrorResetBoundary>`, `isReset()` is
// always false — identical to having no boundary.
export const QueryErrorResetBoundaryContext =
	createContext<QueryErrorResetBoundaryValue>(createValue());

export function useQueryErrorResetBoundary(): QueryErrorResetBoundaryValue {
	return useContext(QueryErrorResetBoundaryContext);
}
