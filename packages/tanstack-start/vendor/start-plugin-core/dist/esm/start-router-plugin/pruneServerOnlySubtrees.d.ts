import { HandleNodeAccumulator, RouteNode } from '@tanstack/router-generator';
export declare function pruneServerOnlySubtrees({ rootRouteNode, acc, }: {
    rootRouteNode: RouteNode;
    acc: HandleNodeAccumulator;
}): {
    routeTree: RouteNode[];
    routeNodes: RouteNode[];
};
