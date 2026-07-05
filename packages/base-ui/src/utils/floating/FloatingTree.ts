// Ported from .base-ui/packages/react/src/floating-ui-react/components/FloatingTree.tsx (v1.6.0),
// octane-adapted: `React.createContext` → octane `createContext`; components return octane elements
// via `createElement`; hooks thread an explicit slot (`useId` → `useBaseUiId`, `useRefWithInit` →
// the binding's). Provides parent/child popup relationships (nested dismiss, nested hover) when
// popups aren't DOM-nested.
import { createContext, createElement, useContext, useMemo } from 'octane';

import { S, subSlot } from '../../internal';
import { useBaseUiId } from '../useBaseUiId';
import { useRefWithInit } from '../useRefWithInit';
import { useLayoutEffect } from 'octane';
import { FloatingTreeStore } from './FloatingTreeStore';
import type { FloatingNodeType, FloatingTreeType } from './types';

const FloatingNodeContext = createContext<FloatingNodeType | null>(null);
const FloatingTreeContext = createContext<FloatingTreeType | null>(null);

export const useFloatingParentNodeId = (): string | null =>
	useContext(FloatingNodeContext)?.id || null;

export const useFloatingTree = (externalTree?: FloatingTreeStore): FloatingTreeType | null => {
	const contextTree = useContext(FloatingTreeContext) as FloatingTreeType | null;
	return externalTree ?? contextTree;
};

export function useFloatingNodeId(
	externalTree: FloatingTreeStore | undefined,
	slot: symbol | undefined,
): string | undefined {
	const id = useBaseUiId(undefined, subSlot(slot, 'id'));
	const tree = useFloatingTree(externalTree);
	const parentId = useFloatingParentNodeId();

	useLayoutEffect(
		() => {
			if (!id) {
				return undefined;
			}
			const node = { id, parentId };
			tree?.addNode(node);
			return () => {
				tree?.removeNode(node);
			};
		},
		[tree, id, parentId],
		subSlot(slot, 'e'),
	);

	return id;
}

export function FloatingNode(props: { children?: any; id: string | undefined }): any {
	const slot = S('FloatingNode');
	const { children, id } = props;
	const parentId = useFloatingParentNodeId();
	const value = useMemo(() => ({ id, parentId }), [id, parentId], subSlot(slot, 'v'));
	return createElement(FloatingNodeContext.Provider, { value, children });
}

export function FloatingTree(props: { children?: any; externalTree?: FloatingTreeStore }): any {
	const slot = S('FloatingTree');
	const { children, externalTree } = props;
	const tree = useRefWithInit<FloatingTreeStore>(
		() => externalTree ?? new FloatingTreeStore(),
		subSlot(slot, 'tree'),
	).current;
	return createElement(FloatingTreeContext.Provider, { value: tree, children });
}

export { FloatingTreeStore };
