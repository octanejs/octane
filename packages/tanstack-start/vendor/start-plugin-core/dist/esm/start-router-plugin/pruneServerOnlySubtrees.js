import "./constants.js";
//#region src/start-router-plugin/pruneServerOnlySubtrees.ts
function pruneServerOnlySubtrees({ rootRouteNode, acc }) {
	const routeNodes = [];
	const routeTree = prune({
		...rootRouteNode,
		children: acc.routeTree
	}, routeNodes)?.children || [];
	routeNodes.pop();
	return {
		routeTree,
		routeNodes
	};
}
function prune(node, collectedRouteNodes) {
	const newChildren = [];
	let allChildrenServerOnly = true;
	for (const child of node.children || []) {
		const newChild = prune(child, collectedRouteNodes);
		if (newChild) {
			newChildren.push(newChild);
			allChildrenServerOnly = false;
		}
	}
	if (node.createFileRouteProps?.has("server") && node.createFileRouteProps.size === 1 && allChildrenServerOnly) return null;
	collectedRouteNodes.push(node);
	return {
		...node,
		children: newChildren
	};
}
//#endregion
export { pruneServerOnlySubtrees };

//# sourceMappingURL=pruneServerOnlySubtrees.js.map