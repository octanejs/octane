// MemoryRouter — transcribed from react-router@8.2.0 lib/components.tsx.
// A declarative Router over an in-memory history stack.
import { startTransition, useCallback, useLayoutEffect, useRef, useState } from 'octane';
import { createMemoryHistory } from '../router/history.ts';
import { Router } from './Router.tsrx';

export function MemoryRouter(props) @{
	const { basename, children, initialEntries, initialIndex, useTransitions } = props;

	const historyRef = useRef(null);
	if (historyRef.current == null) {
		historyRef.current = createMemoryHistory({
			initialEntries,
			initialIndex,
			v5Compat: true,
		});
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
