import { useEffect, useRef } from 'octane';

import { useReactFlow } from './useReactFlow';
import { resolveHookSlot } from './slot';
import type { OnInit, Node, Edge } from '../types';

export function useOnInitHandler<NodeType extends Node = Node, EdgeType extends Edge = Edge>(
	onInit: OnInit<NodeType, EdgeType> | undefined,
	...rest: [slot?: symbol]
) {
	const slot = resolveHookSlot(rest);
	const rfInstance = useReactFlow<NodeType, EdgeType>(slot);
	const isInitialized = useRef<boolean>(false, slot);

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
		slot,
	);
}
