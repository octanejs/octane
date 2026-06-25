import { useState } from 'octane-ts';
import { QueryErrorResetBoundaryContext, createValue } from './errorResetBoundary.ts';

// QueryErrorResetBoundary — provides a fresh reset coordinator to its subtree.
// Place it above an error boundary; a component inside reads the value with
// `useQueryErrorResetBoundary()` and calls `.reset()` from the boundary's retry so
// the query refetches instead of immediately re-throwing. Authored in .tsrx (it's
// a component that renders a context Provider with a stable per-instance value).
export function QueryErrorResetBoundary(props) @{
	const [value] = useState(() => createValue());
	<QueryErrorResetBoundaryContext.Provider
		value={value}
	>{props.children}</QueryErrorResetBoundaryContext.Provider>
}
