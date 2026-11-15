import { shallow } from '@octanejs/zustand/shallow';
import { resolveHookSlot, withoutSlot } from './slot';
import { pointToRendererPoint } from '@xyflow/system';

import { useStore } from './useStore';
import type { Node, ReactFlowStore } from '../types';

type ConnectionFor<NodeType extends Node = Node> = ReactFlowStore<NodeType>['connection'];

function storeSelector(s: ReactFlowStore) {
	return s.connection.inProgress
		? { ...s.connection, to: pointToRendererPoint(s.connection.to, s.transform) }
		: { ...s.connection };
}

function getSelector<NodeType extends Node = Node, SelectorReturn = ConnectionFor<NodeType>>(
	connectionSelector?: (connection: ConnectionFor<NodeType>) => SelectorReturn,
): (s: ReactFlowStore) => SelectorReturn | ConnectionFor {
	if (connectionSelector) {
		const combinedSelector = (s: ReactFlowStore) => {
			const connection = storeSelector(s) as ConnectionFor<NodeType>;
			return connectionSelector(connection);
		};
		return combinedSelector;
	}

	return storeSelector;
}
/**
 * The `useConnection` hook returns the current connection when there is an active
 * connection interaction. If no connection interaction is active, it returns null
 * for every property. A typical use case for this hook is to colorize handles
 * based on a certain condition (e.g. if the connection is valid or not).
 *
 * @public
 * @param connectionSelector - An optional selector function used to extract a slice of the
 * `ConnectionState` data. Using a selector can prevent component re-renders where data you don't
 * otherwise care about might change. If a selector is not provided, the entire `ConnectionState`
 * object is returned unchanged.
 * @example
 *
 * ```tsx
 *import { useConnection } from '@xyflow/react';
 *
 *function App() {
 *  const connection = useConnection();
 *
 *  return (
 *    <div> {connection ? `Someone is trying to make a connection from ${connection.fromNode} to this one.` : 'There are currently no incoming connections!'}
 *
 *   </div>
 *   );
 * }
 * ```
 *
 * @returns ConnectionState
 */
export function useConnection<
	NodeType extends Node = Node,
	SelectorReturn = ConnectionFor<NodeType>,
>(
	connectionSelector?: (connection: ConnectionFor<NodeType>) => SelectorReturn,
	...rest: [slot?: symbol]
): SelectorReturn;
export function useConnection<
	NodeType extends Node = Node,
	SelectorReturn = ConnectionFor<NodeType>,
>(
	connectionSelectorArg?: ((connection: ConnectionFor<NodeType>) => SelectorReturn) | symbol,
	...rest: [slot?: symbol]
): SelectorReturn {
	const slot =
		resolveHookSlot(rest) ??
		(typeof connectionSelectorArg === 'symbol' ? connectionSelectorArg : undefined);
	const connectionSelector = withoutSlot(connectionSelectorArg);
	const combinedSelector = getSelector<NodeType, SelectorReturn>(connectionSelector);
	return useStore(combinedSelector, shallow, slot) as SelectorReturn;
}
