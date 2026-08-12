/** @jsxImportSource @octanejs/three/intrinsics */
import { type Context, type OctaneNode, useContext, useMemo, useRef } from 'octane';
import { defineUniversalComponent, universalComponent, universalContext, type UniversalRenderable } from 'octane/universal';
import { stripTrailingSlot } from './compiler-slot.js';

type BridgeProps = { children?: OctaneNode };
type BridgeRendererProps = BridgeProps & { contexts: Array<Context<any>>; values: { current: unknown[] } };

function BridgeRenderer({ children, contexts, values }: BridgeRendererProps) @{
	let result = children as UniversalRenderable;
	for (let index = contexts.length - 1; index >= 0; index--) {
		result = universalContext(contexts[index]!, values.current[index], result);
	}
	<>{result}</>
}

export function useContextBridge(...contexts: Array<Context<any>>) {
	contexts = stripTrailingSlot(contexts);
	const values = useRef<unknown[]>([]);
	values.current = contexts.map((context) => useContext(context));
	return useMemo(() => defineUniversalComponent<BridgeProps>(
		'three',
		(props) => universalComponent('three', BridgeRenderer as any, { ...props, contexts, values }),
	), []);
}
