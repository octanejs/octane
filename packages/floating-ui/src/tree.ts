// Ported from @floating-ui/react's FloatingTree / FloatingNode. The contexts + read
// hooks let useFloating / the interaction hooks query nesting; the components +
// useFloatingNodeId register nodes in the tree. `.ts` components via createElement.
import {
	createContext,
	createElement,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from 'octane';
import type { OctaneNode } from 'octane';

import { createPubSub } from './pubsub';
import { S, splitSlot, subSlot } from './internal';
import { useId } from './useId';
import { useModernLayoutEffect } from './utils';
import type { FloatingNodeType, FloatingTreeType, ReferenceType } from './types';

interface FloatingNodeContextValue {
	id: string | undefined;
	parentId: string | null;
}

export const FloatingNodeContext = createContext<FloatingNodeContextValue | null>(null);
export const FloatingTreeContext = createContext<FloatingTreeType | null>(null);

/**
 * Returns the parent node id for nested floating elements, if available.
 * Returns `null` for top-level floating elements.
 */
export const useFloatingParentNodeId = (): string | null => {
	const context = useContext(FloatingNodeContext);
	// A FloatingNode's `id` may be undefined (upstream allows it); the public
	// contract is `string | null`, so coalesce.
	return context ? (context.id ?? null) : null;
};

/**
 * Returns the nearest floating tree context, if available.
 */
export const useFloatingTree = <
	RT extends ReferenceType = ReferenceType,
>(): FloatingTreeType<RT> | null => useContext(FloatingTreeContext) as FloatingTreeType<RT> | null;

/**
 * Registers a node into the `FloatingTree`, returning its id.
 * @see https://floating-ui.com/docs/FloatingTree
 */
export function useFloatingNodeId(customParentId?: string, slot?: symbol): string;
export function useFloatingNodeId(slot?: symbol): string;
export function useFloatingNodeId(...args: any[]): string {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFloatingNodeId');
	const customParentId = user[0] as string | undefined;

	const id = useId(subSlot(slot, 'id'));
	const tree = useFloatingTree();
	const reactParentId = useFloatingParentNodeId();
	const parentId = customParentId || reactParentId;
	useModernLayoutEffect(
		() => {
			if (!id) return;
			const node = { id, parentId };
			tree?.addNode(node);
			return () => {
				tree?.removeNode(node);
			};
		},
		[tree, id, parentId],
		subSlot(slot, 'eff'),
	);
	return id;
}

export interface FloatingNodeProps {
	children?: OctaneNode;
	id: string | undefined;
}

/**
 * Provides parent node context for nested floating elements.
 * @see https://floating-ui.com/docs/FloatingTree
 */
export function FloatingNode(props: FloatingNodeProps): OctaneNode {
	const children = props.children;
	const id = props.id;
	const parentId = useFloatingParentNodeId();
	const value = useMemo(() => ({ id, parentId }), [id, parentId], S('FloatingNode:value'));
	return createElement(FloatingNodeContext.Provider, { value, children });
}

export interface FloatingTreeProps {
	children?: OctaneNode;
}

/**
 * Provides context for nested floating elements when they are not children of
 * each other on the DOM.
 * @see https://floating-ui.com/docs/FloatingTree
 */
export function FloatingTree(props: FloatingTreeProps): OctaneNode {
	const children = props.children;
	const nodesRef = useRef<FloatingNodeType[]>([], S('FloatingTree:nodes'));
	const addNode = useCallback(
		(node: FloatingNodeType) => {
			nodesRef.current = [...nodesRef.current, node];
		},
		[],
		S('FloatingTree:add'),
	);
	const removeNode = useCallback(
		(node: FloatingNodeType) => {
			nodesRef.current = nodesRef.current.filter((n) => n !== node);
		},
		[],
		S('FloatingTree:remove'),
	);
	const [events] = useState(() => createPubSub(), S('FloatingTree:events'));
	const value = useMemo<FloatingTreeType>(
		() => ({ nodesRef, addNode, removeNode, events }),
		[addNode, removeNode, events],
		S('FloatingTree:value'),
	);
	return createElement(FloatingTreeContext.Provider, { value, children });
}
