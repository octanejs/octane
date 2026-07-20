import { HandleNodeAccumulator, RouteNode } from '#tanstack-start/router-generator';
export declare function pruneServerOnlySubtrees({
	rootRouteNode,
	acc,
}: {
	rootRouteNode: RouteNode;
	acc: HandleNodeAccumulator;
}): {
	routeTree: RouteNode[];
	routeNodes: RouteNode[];
};
