// Type declaration for the .tsrx component (resolved by relative path).
import type { Action, History, Location } from '../router/history';
import type { Navigator } from '../context';

export declare const Router: (props: {
	basename?: string;
	children?: unknown;
	location: Partial<Location> | string;
	navigationType?: any;
	navigator: Navigator;
	static?: boolean;
	useTransitions?: boolean;
}) => unknown;

type HistoryNavigation = { navigator: History; location: Location; navigationType: Action };
export declare function useOwnedHistoryNavigation(
	ref: { readonly current: History },
	useTransitions?: boolean,
): HistoryNavigation;
export declare function useHistoryNavigation(
	history: History,
	useTransitions?: boolean,
): HistoryNavigation;
