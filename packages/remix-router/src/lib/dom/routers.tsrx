'use strong';

// BrowserRouter / HashRouter / HistoryRouter — transcribed from
// react-router@8.2.0 lib/dom/lib.tsx. Declarative routers over browser /
// hash / caller-provided history.
import { useLazyRef } from 'octane';
import type { OctaneNode } from 'octane';
import { createBrowserHistory, createHashHistory } from '../router/history';
import type { History } from '../router/history';
import { Router, useHistoryNavigation, useOwnedHistoryNavigation } from '../components/Router.tsrx';

type BrowserRouterProps = {
	basename?: string;
	children?: OctaneNode;
	useTransitions?: boolean;
	window?: Window;
};

export function BrowserRouter(props: BrowserRouterProps) @{
	const { basename, children, useTransitions, window } = props;

	const historyRef = useLazyRef(() => createBrowserHistory({ window, v5Compat: true }));
	const navigation = useOwnedHistoryNavigation(historyRef, useTransitions);

	<Router {...navigation} basename={basename} useTransitions={useTransitions} children={children} />
}

type HashRouterProps = BrowserRouterProps;

export function HashRouter(props: HashRouterProps) @{
	const { basename, children, useTransitions, window } = props;

	const historyRef = useLazyRef(() => createHashHistory({ window, v5Compat: true }));
	const navigation = useOwnedHistoryNavigation(historyRef, useTransitions);

	<Router {...navigation} basename={basename} useTransitions={useTransitions} children={children} />
}

/**
 * A declarative router that accepts a pre-instantiated `history` object.
 * Exported as `unstable_HistoryRouter`, as upstream.
 */
type HistoryRouterProps = {
	basename?: string;
	children?: OctaneNode;
	history: History;
	useTransitions?: boolean;
};

export function HistoryRouter(props: HistoryRouterProps) @{
	const { basename, children, history, useTransitions } = props;

	const navigation = useHistoryNavigation(history, useTransitions);

	<Router {...navigation} basename={basename} useTransitions={useTransitions} children={children} />
}
