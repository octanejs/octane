import { HandleNodeAccumulator, RouteNode } from '@octanejs/tanstack-router/router-generator';
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
