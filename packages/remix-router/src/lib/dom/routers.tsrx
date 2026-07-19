// BrowserRouter / HashRouter / HistoryRouter — transcribed from
// react-router@8.2.0 lib/dom/lib.tsx. Declarative routers over browser /
// hash / caller-provided history (upstream repeats the subscribe body in each;
// so does this transcription).
import { startTransition, useCallback, useLayoutEffect, useRef, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { createBrowserHistory, createHashHistory } from '../router/history';
import type { BrowserHistory, HashHistory, History, Update } from '../router/history';
import { Router } from '../components/Router.tsrx';

type BrowserRouterProps = {
	basename?: string;
	children?: OctaneNode;
	useTransitions?: boolean;
	window?: Window;
};

export function BrowserRouter(props: BrowserRouterProps) @{
	const { basename, children, useTransitions, window } = props;

	const historyRef = useRef<BrowserHistory | null>(null);
	if (historyRef.current == null) {
		historyRef.current = createBrowserHistory({ window, v5Compat: true });
	}

	const history = historyRef.current;
	const [state, setStateImpl] = useState({
		action: history.action,
		location: history.location,
	});
	const setState = useCallback((newState: Update) => {
		if (useTransitions === false) {
			setStateImpl(newState);
		} else {
			startTransition(() => setStateImpl(newState));
		}
	}, [useTransitions]);

	useLayoutEffect(() => history.listen(setState), [history, setState]);

	<Router
		basename={basename}
		location={state.location}
		navigationType={state.action}
		navigator={history}
		useTransitions={useTransitions}
		children={children}
	/>
}

type HashRouterProps = BrowserRouterProps;

export function HashRouter(props: HashRouterProps) @{
	const { basename, children, useTransitions, window } = props;

	const historyRef = useRef<HashHistory | null>(null);
	if (historyRef.current == null) {
		historyRef.current = createHashHistory({ window, v5Compat: true });
	}

	const history = historyRef.current;
	const [state, setStateImpl] = useState({
		action: history.action,
		location: history.location,
	});
	const setState = useCallback((newState: Update) => {
		if (useTransitions === false) {
			setStateImpl(newState);
		} else {
			startTransition(() => setStateImpl(newState));
		}
	}, [useTransitions]);

	useLayoutEffect(() => history.listen(setState), [history, setState]);

	<Router
		basename={basename}
		location={state.location}
		navigationType={state.action}
		navigator={history}
		useTransitions={useTransitions}
		children={children}
	/>
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

	const [state, setStateImpl] = useState({
		action: history.action,
		location: history.location,
	});
	const setState = useCallback((newState: Update) => {
		if (useTransitions === false) {
			setStateImpl(newState);
		} else {
			startTransition(() => setStateImpl(newState));
		}
	}, [useTransitions]);

	useLayoutEffect(() => history.listen(setState), [history, setState]);

	<Router
		basename={basename}
		location={state.location}
		navigationType={state.action}
		navigator={history}
		useTransitions={useTransitions}
		children={children}
	/>
}
