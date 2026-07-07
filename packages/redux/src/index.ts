// @octanejs/redux — React Redux for the octane renderer.
//
// The binding layer (Provider + hooks + Subscription) reimplemented on octane's
// native useSyncExternalStore; works with any Redux store — Redux Toolkit
// included — by changing the import. The store, reducers, middleware, and
// reselect selectors are framework-agnostic and unchanged.
//
// Surface: everything react-redux 9 exports EXCEPT `connect`/`legacy_connect`
// (the class-era HOC — importable for compatibility, throws with guidance when
// called; the hooks API is the supported path).
export { Provider } from './Provider.tsrx';
export { ReactReduxContext } from './Context';
export type { ReactReduxContextValue, ReactReduxContextInstance } from './Context';
export {
	createReduxContextHook,
	useReduxContext,
	createStoreHook,
	useStore,
	createDispatchHook,
	useDispatch,
	createSelectorHook,
	useSelector,
} from './hooks';
export { shallowEqual } from './utils/shallowEqual';
export { createSubscription } from './utils/Subscription';
export type { Subscription } from './utils/Subscription';
export { useSyncExternalStoreWithSelector } from './utils/useSyncExternalStoreWithSelector';

// `batch` is a no-op passthrough in react-redux 9 (React 18+ auto-batches;
// octane batches renders in a microtask the same way).
export function batch(callback: () => void): void {
	callback();
}

// The legacy HOC is not ported — octane has no class components and the hooks
// API covers the same ground. Kept as a throwing export so imports stay
// compatible and the failure is actionable.
export function connect(): never {
	throw new Error(
		'@octanejs/redux does not port `connect` — use the hooks API ' +
			'(useSelector/useDispatch) instead.',
	);
}
export const legacy_connect = connect;
