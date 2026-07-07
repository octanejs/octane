// The default react-redux context — port of components/Context.ts. Upstream
// dedupes the context instance across multiple copies of the module via a
// globalThis map keyed by React's createContext; the same hazard exists under
// Vite dev (duplicate module instances — see the repo's ?import lesson), so the
// port keeps the mechanism with octane's createContext as the key.
import { createContext } from 'octane';
import type { Store, Action, UnknownAction } from 'redux';
import type { Subscription } from './utils/Subscription';

export interface ReactReduxContextValue<SS = any, A extends Action<string> = UnknownAction> {
	store: Store<SS, A>;
	subscription: Subscription;
	getServerState?: () => SS;
}

// Namespaced for octane — the export NAME stays `ReactReduxContext` for
// drop-in import compatibility, but the dedupe key (and everything else
// non-public in this package) is octane-branded.
const ContextKey = Symbol.for('octane-react-redux-context');
const gT: any = typeof globalThis !== 'undefined' ? globalThis : {};

function getContext() {
	const contextMap: Map<typeof createContext, any> = (gT[ContextKey] ??= new Map());
	let realContext = contextMap.get(createContext);
	if (!realContext) {
		realContext = createContext<ReactReduxContextValue | null>(null);
		contextMap.set(createContext, realContext);
	}
	return realContext as ReturnType<typeof createContext<ReactReduxContextValue | null>>;
}

export const ReactReduxContext = getContext();
export type ReactReduxContextInstance = typeof ReactReduxContext;
