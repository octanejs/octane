// Type declaration for the .tsrx components (resolved by relative path).
import type { History } from '../router/history';

export declare const BrowserRouter: (props: {
	basename?: string;
	children?: unknown;
	useTransitions?: boolean;
	window?: Window;
}) => unknown;

export declare const HashRouter: (props: {
	basename?: string;
	children?: unknown;
	useTransitions?: boolean;
	window?: Window;
}) => unknown;

export declare const HistoryRouter: (props: {
	basename?: string;
	children?: unknown;
	history: History;
	useTransitions?: boolean;
}) => unknown;
