import { useContext, useMemo } from 'octane';
import { useStoreWithEqualityFn as useZustandStore } from '@octanejs/zustand/traditional';
import type { StoreApi } from '@octanejs/zustand';
import { errorMessages } from '@xyflow/system';

import StoreContext from '../contexts/StoreContext';
import type { Edge, Node, ReactFlowState } from '../types';

const zustandErrorMessage = errorMessages['error001']('react');

type EqualityStoreHook = <TState, StateSlice>(
	api: StoreApi<TState>,
	selector: (state: TState) => StateSlice,
	equalityFn: ((a: StateSlice, b: StateSlice) => boolean) | undefined,
	slot: symbol | undefined,
) => StateSlice;

function useStore<StateSlice = unknown>(
	selector: (state: ReactFlowState) => StateSlice,
	equalityFn?: (a: StateSlice, b: StateSlice) => boolean,
	...rest: [slot?: symbol]
): StateSlice {
	const tail = rest[rest.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	const store = useContext(StoreContext);

	if (store === null) {
		throw new Error(zustandErrorMessage);
	}

	return (useZustandStore as EqualityStoreHook)(store, selector, equalityFn, slot);
}

function useStoreApi<NodeType extends Node = Node, EdgeType extends Edge = Edge>(
	...rest: [slot?: symbol]
) {
	const tail = rest[rest.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	const store = useContext(StoreContext) as StoreApi<ReactFlowState<NodeType, EdgeType>> | null;

	if (store === null) {
		throw new Error(zustandErrorMessage);
	}

	return useMemo(
		function memoStoreApi() {
			return {
				getState: store.getState,
				setState: store.setState,
				subscribe: store.subscribe,
			};
		},
		[store],
		slot,
	);
}

export { useStore, useStoreApi };
