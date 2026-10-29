'use strong';

// MemoryRouter — transcribed from react-router@8.2.0 lib/components.tsx.
// A declarative Router over an in-memory history stack.
import { startTransition, useCallback, useLayoutEffect, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { createMemoryHistory } from '../router/history.ts';
import type { InitialEntry, Update } from '../router/history.ts';
import { Router } from './Router.tsrx';

type MemoryRouterProps = {
	basename?: string;
	children?: OctaneNode;
	initialEntries?: InitialEntry[];
	initialIndex?: number;
	useTransitions?: boolean;
};

export function MemoryRouter(props: MemoryRouterProps) @{
	const { basename, children, initialEntries, initialIndex, useTransitions } = props;

	const [history] = useState(() =>
		createMemoryHistory({ initialEntries, initialIndex, v5Compat: true }),
	);
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
	});

	useLayoutEffect(() => history.listen(setState));

	<Router
		basename={basename}
		location={state.location}
		navigationType={state.action}
		navigator={history}
		useTransitions={useTransitions}
		children={children}
	/>
}
