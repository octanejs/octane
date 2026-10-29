'use strong';

// MemoryRouter — transcribed from react-router@8.2.0 lib/components.tsx.
// A declarative Router over an in-memory history stack.
import { useLazyRef } from 'octane';
import type { OctaneNode } from 'octane';
import { createMemoryHistory } from '../router/history.ts';
import type { InitialEntry } from '../router/history.ts';
import { Router, useOwnedHistoryNavigation } from './Router.tsrx';

type MemoryRouterProps = {
	basename?: string;
	children?: OctaneNode;
	initialEntries?: InitialEntry[];
	initialIndex?: number;
	useTransitions?: boolean;
};

export function MemoryRouter(props: MemoryRouterProps) @{
	const { basename, children, initialEntries, initialIndex, useTransitions } = props;

	const historyRef = useLazyRef(() =>
		createMemoryHistory({ initialEntries, initialIndex, v5Compat: true }),
	);
	const navigation = useOwnedHistoryNavigation(historyRef, useTransitions);

	<Router {...navigation} basename={basename} useTransitions={useTransitions} children={children} />
}
