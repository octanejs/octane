// Ported from .base-ui/packages/react/src/floating-ui-react/utils/nodes.ts (the subset used).
// Walks the FloatingTree's flat node list to collect a node's (optionally open) descendants.
import type { FloatingNodeType } from './types';

export function getNodeChildren(
	nodes: Array<FloatingNodeType>,
	id: string | undefined,
	onlyOpenChildren = true,
): Array<FloatingNodeType> {
	const directChildren = nodes.filter((node) => node.parentId === id);
	return directChildren.flatMap((child) => [
		...(!onlyOpenChildren || child.context?.open ? [child] : []),
		...getNodeChildren(nodes, child.id, onlyOpenChildren),
	]);
}

export function getNodeAncestors(
	nodes: Array<FloatingNodeType>,
	id: string | undefined,
): Array<FloatingNodeType> {
	let allAncestors: Array<FloatingNodeType> = [];
	let currentParentId = nodes.find((node) => node.id === id)?.parentId;
	while (currentParentId) {
		const currentNode = nodes.find((node) => node.id === currentParentId);
		currentParentId = currentNode?.parentId;
		if (currentNode) {
			allAncestors = allAncestors.concat(currentNode);
		}
	}
	return allAncestors;
}
