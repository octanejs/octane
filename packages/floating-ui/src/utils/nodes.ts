// Ported from @floating-ui/react/utils/nodes. Kept separate from the DOM and
// hook helpers so tree algorithms can be exercised without a browser runtime.
import type { FloatingNodeType, ReferenceType } from '../types';

export function getNodeChildren<RT extends ReferenceType = ReferenceType>(
	nodes: Array<FloatingNodeType<RT>>,
	id: string | undefined,
	onlyOpenChildren = true,
): Array<FloatingNodeType<RT>> {
	const directChildren = nodes.filter(
		(node) => node.parentId === id && (!onlyOpenChildren || node.context?.open),
	);
	return directChildren.flatMap((child) => [
		child,
		...getNodeChildren(nodes, child.id, onlyOpenChildren),
	]);
}

export function getDeepestNode<RT extends ReferenceType = ReferenceType>(
	nodes: Array<FloatingNodeType<RT>>,
	id: string | undefined,
): FloatingNodeType<RT> | undefined {
	const childrenByParent = new Map<string | null | undefined, Array<FloatingNodeType<RT>>>();
	for (const node of nodes) {
		if (!node.context?.open) continue;
		const siblings = childrenByParent.get(node.parentId);
		if (siblings) {
			siblings.push(node);
		} else {
			childrenByParent.set(node.parentId, [node]);
		}
	}

	let deepestNodeId = id;
	let maxDepth = 0;
	const stack: Array<[FloatingNodeType<RT>, number]> = [];
	const rootChildren = childrenByParent.get(id);
	if (rootChildren) {
		for (let index = rootChildren.length - 1; index >= 0; index--) {
			stack.push([rootChildren[index], 1]);
		}
	}

	while (stack.length) {
		const [node, depth] = stack.pop()!;
		if (depth > maxDepth) {
			deepestNodeId = node.id;
			maxDepth = depth;
		}
		const children = childrenByParent.get(node.id);
		if (children) {
			for (let index = children.length - 1; index >= 0; index--) {
				stack.push([children[index], depth + 1]);
			}
		}
	}

	return nodes.find((node) => node.id === deepestNodeId);
}

export function getNodeAncestors<RT extends ReferenceType = ReferenceType>(
	nodes: Array<FloatingNodeType<RT>>,
	id: string | undefined,
): Array<FloatingNodeType<RT>> {
	let allAncestors: Array<FloatingNodeType<RT>> = [];
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
