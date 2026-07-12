// BrowserRouter / HashRouter / HistoryRouter — transcribed from
// react-router@7.18.1 lib/dom/lib.tsx. Declarative routers over browser /
// hash / caller-provided history (upstream repeats the subscribe body in each;
// so does this transcription).
import { startTransition, useCallback, useLayoutEffect, useRef, useState } from 'octane';
import { createBrowserHistory, createHashHistory } from '../router/history';
import { Router } from '../components/Router.tsrx';

export function BrowserRouter(props) @{
	const { basename, children, useTransitions, window } = props;

	const historyRef = useRef(null);
	if (historyRef.current == null) {
		historyRef.current = createBrowserHistory({ window, v5Compat: true });
	}

	const history = historyRef.current;
	const [state, setStateImpl] = useState({
		action: history.action,
		location: history.location,
	});
	const setState = useCallback((newState) => {
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

export function HashRouter(props) @{
	const { basename, children, useTransitions, window } = props;

	const historyRef = useRef(null);
	if (historyRef.current == null) {
		historyRef.current = createHashHistory({ window, v5Compat: true });
	}

	const history = historyRef.current;
	const [state, setStateImpl] = useState({
		action: history.action,
		location: history.location,
	});
	const setState = useCallback((newState) => {
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
export function HistoryRouter(props) @{
	const { basename, children, history, useTransitions } = props;

	const [state, setStateImpl] = useState({
		action: history.action,
		location: history.location,
	});
	const setState = useCallback((newState) => {
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
