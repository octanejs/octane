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

import { createPubSub } from './pubsub';
import { S, splitSlot, subSlot } from './internal';
import { useId } from './useId';
import { useModernLayoutEffect } from './utils';

export const FloatingNodeContext = createContext<any>(null);
export const FloatingTreeContext = createContext<any>(null);

export const useFloatingParentNodeId = (): string | null => {
	const context = useContext(FloatingNodeContext);
	return context ? context.id : null;
};

export const useFloatingTree = (): any => useContext(FloatingTreeContext);

export function useFloatingNodeId(...args: any[]): string {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFloatingNodeId');
	const customParentId = user[0];

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

export function FloatingNode(props: any): any {
	const children = props.children;
	const id = props.id;
	const parentId = useFloatingParentNodeId();
	const value = useMemo(() => ({ id, parentId }), [id, parentId], S('FloatingNode:value'));
	return createElement(FloatingNodeContext.Provider, { value, children });
}

export function FloatingTree(props: any): any {
	const children = props.children;
	const nodesRef = useRef<any[]>([], S('FloatingTree:nodes'));
	const addNode = useCallback(
		(node: any) => {
			nodesRef.current = [...nodesRef.current, node];
		},
		[],
		S('FloatingTree:add'),
	);
	const removeNode = useCallback(
		(node: any) => {
			nodesRef.current = nodesRef.current.filter((n) => n !== node);
		},
		[],
		S('FloatingTree:remove'),
	);
	const [events] = useState(() => createPubSub(), S('FloatingTree:events'));
	const value = useMemo(
		() => ({ nodesRef, addNode, removeNode, events }),
		[addNode, removeNode, events],
		S('FloatingTree:value'),
	);
	return createElement(FloatingTreeContext.Provider, { value, children });
}
