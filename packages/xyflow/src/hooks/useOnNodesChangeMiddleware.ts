import { useEffect, useState } from 'octane';
import { resolveHookSlot, subSlot } from './slot';
import type { NodeChange } from '@xyflow/system';

import { useStoreApi } from './useStore';
import type { Edge, Node } from '../types';

/**
 * Registers a middleware function to transform node changes.
 *
 * @public
 * @param fn - Middleware function. Should be memoized with useCallback to avoid re-registration.
 */
export function experimental_useOnNodesChangeMiddleware<NodeType extends Node = Node>(
	fn: (changes: NodeChange<NodeType>[]) => NodeChange<NodeType>[],
	...rest: [slot?: symbol]
) {
	const slot = resolveHookSlot(rest);
	const store = useStoreApi<NodeType, Edge>(subSlot(slot, 'store'));
	const [symbol] = useState(
		function createSymbol() {
			return Symbol();
		},
		subSlot(slot, 'symbol'),
	);

	useEffect(
		function registerMiddleware() {
			const { onNodesChangeMiddlewareMap } = store.getState();
			onNodesChangeMiddlewareMap.set(symbol, fn);
		},
		[fn],
		subSlot(slot, 'register'),
	);

	useEffect(
		function unregisterMiddleware() {
			const { onNodesChangeMiddlewareMap } = store.getState();
			return function cleanup() {
				onNodesChangeMiddlewareMap.delete(symbol);
			};
		},
		[],
		subSlot(slot, 'unregister'),
	);
}
