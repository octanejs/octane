import { useEffect, useRef } from 'octane';
import { errorMessages } from '@xyflow/system';

import { useStoreApi } from '../../hooks/useStore';
import { resolveHookSlot, subSlot, withoutSlot } from '../../hooks/slot';
import type { EdgeTypes, NodeTypes } from '../../types';

// Kept module-local so browser consumers do not need `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

const emptyTypes = {};

/**
 * This hook warns the user if nodeTypes or edgeTypes changed.
 * It is only used in development mode.
 *
 * @internal
 */
export function useNodeOrEdgeTypesWarning(nodeOrEdgeTypes?: NodeTypes): void;
export function useNodeOrEdgeTypesWarning(nodeOrEdgeTypes?: EdgeTypes): void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useNodeOrEdgeTypesWarning(
	nodeOrEdgeTypesArg: any = emptyTypes,
	...rest: [slot?: symbol]
): any {
	const slot =
		resolveHookSlot(rest) ??
		(typeof nodeOrEdgeTypesArg === 'symbol' ? nodeOrEdgeTypesArg : undefined);
	const nodeOrEdgeTypes = withoutSlot(nodeOrEdgeTypesArg) ?? emptyTypes;
	const typesRef = useRef(nodeOrEdgeTypes, subSlot(slot, 'types'));
	const store = useStoreApi(subSlot(slot, 'store'));

	useEffect(
		() => {
			if (process.env.NODE_ENV === 'development') {
				const usedKeys = new Set([
					...Object.keys(typesRef.current),
					...Object.keys(nodeOrEdgeTypes),
				]);

				for (const key of usedKeys) {
					if (typesRef.current[key] !== nodeOrEdgeTypes[key]) {
						store.getState().onError?.('002', errorMessages['error002']());
						break;
					}
				}

				typesRef.current = nodeOrEdgeTypes;
			}
		},
		[nodeOrEdgeTypes],
		subSlot(slot, 'warn'),
	);
}
