// Type declaration for the .tsrx component (resolved by relative path).
import type { Location } from '../router/history';
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
