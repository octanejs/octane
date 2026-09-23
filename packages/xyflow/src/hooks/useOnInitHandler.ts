import { useEffect, useRef } from 'octane';

import { useReactFlow } from './useReactFlow';
import { resolveHookSlot, subSlot } from './slot';
import type { OnInit, Node, Edge } from '../types';

export function useOnInitHandler<NodeType extends Node = Node, EdgeType extends Edge = Edge>(
	onInit: OnInit<NodeType, EdgeType> | undefined,
	...rest: [slot?: symbol]
) {
	const slot = resolveHookSlot(rest);
	const rfInstance = useReactFlow<NodeType, EdgeType>(subSlot(slot, 'flow'));
	const isInitialized = useRef<boolean>(false, subSlot(slot, 'initialized'));

	useEffect(
		function onInitEffect() {
			if (!isInitialized.current && rfInstance.viewportInitialized && onInit) {
				setTimeout(function invokeOnInit() {
					onInit(rfInstance);
				}, 1);
				isInitialized.current = true;
			}
		},
		[onInit, rfInstance.viewportInitialized],
		subSlot(slot, 'init'),
	);
}
