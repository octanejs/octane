import * as React from 'octane';

export function isRenderableNode(node: React.OctaneNode): boolean {
	if (node == null || typeof node === 'boolean' || node === '') {
		return false;
	}
	if (Array.isArray(node)) {
		return node.some(isRenderableNode);
	}
	return true;
}

export function hasRenderableChildren(element: React.OctaneNode): boolean {
	return (
		React.isValidElement<{ children?: React.OctaneNode }>(element) &&
		isRenderableNode(element.props.children)
	);
}
