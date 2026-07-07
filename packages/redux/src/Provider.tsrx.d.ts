// Type declaration for the .tsrx component (resolved by relative path).
import type { Action, Store, UnknownAction } from 'redux';
import type { ReactReduxContextInstance } from './Context';

export declare const Provider: <A extends Action<string> = UnknownAction, S = unknown>(props: {
	store: Store<S, A>;
	children?: unknown;
	context?: ReactReduxContextInstance | null;
	serverState?: S;
}) => unknown;
