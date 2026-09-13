import { createContext, createElement } from 'octane';
import type { OctaneNode } from 'octane';

export type NonRouteComponent = 'pendingComponent' | 'errorComponent' | 'notFoundComponent';
export const nonRouteComponentContext = createContext<NonRouteComponent | undefined>(undefined);

export function wrapInNonRouteComponentContext(
	element: OctaneNode,
	component: NonRouteComponent,
): OctaneNode {
	return createElement(nonRouteComponentContext.Provider, { value: component, children: element });
}
