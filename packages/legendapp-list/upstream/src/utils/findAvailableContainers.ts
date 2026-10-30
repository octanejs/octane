import { peek$, type StateContext } from "@/state/state";
import { IS_DEV } from "@/utils/devEnvironment";

export interface ContainerAllocation {
    containerIndex: number;
    itemIndex: number;
    itemType?: string;
}

interface AvailableContainer {
    containerIndex: number;
    distance: number;
}

interface RequestedContainer {
    isSticky: boolean;
    itemIndex: number;
    itemType?: string;
    order: number;
}

// Allocate the whole request batch together rather than greedily assigning each item.
// This lets every request claim an exact-type container before earlier requests can
// consume those containers through untyped or cross-type reuse. Normal and sticky
// pools stay separate, and only requests that cannot reuse a candidate grow the pool.
export function findAvailableContainers(
    ctx: StateContext,
    needNewContainers: number[],
    startBuffered: number,
    endBuffered: number,
    pendingRemoval: number[],
    getRequiredItemType?: (itemIndex: number) => string | undefined,
    protectedKeys?: Set<string>,
): ContainerAllocation[] {
    const numNeeded = needNewContainers.length;
    if (numNeeded === 0) {
        return [];
    }

    const numContainers = peek$(ctx, "numContainers");
    const state = ctx.state;
    const { containerItemMetadata, stickyContainerPool } = state;
    const shouldAvoidAssignedContainerReuse = state.props.recycleItems && !!state.props.positionComponentInternal;
    const pendingRemovalSet = pendingRemoval.length > 0 ? new Set(pendingRemoval) : undefined;

    const requests: RequestedContainer[] = needNewContainers.map((itemIndex, order) => ({
        isSticky: state.props.stickyHeaderIndicesSet.has(itemIndex),
        itemIndex,
        itemType: getRequiredItemType?.(itemIndex),
        order,
    }));
    const normalRequests = requests.filter((request) => !request.isSticky);
    const stickyRequests = requests.filter((request) => request.isSticky);
    const normalCandidates: AvailableContainer[] = [];
    const stickyCandidates: AvailableContainer[] = [];

    // Unassigned and pending-removal containers are immediately reusable, so they
    // sort ahead with an infinite distance. Assigned normal containers are eligible
    // only outside the buffered range and are ranked farthest-first to avoid stealing
    // a container that may soon re-enter the viewport. Assigned reuse is disabled while
    // recycled layout animations may still need the outgoing view. Sticky containers
    // never leave their dedicated pool, and active or protected containers are excluded.
    for (let containerIndex = 0; containerIndex < numContainers; containerIndex++) {
        const key = peek$(ctx, `containerItemKey${containerIndex}`);
        const isPendingRemoval = !!pendingRemovalSet?.has(containerIndex);
        const isProtected = !!key && !!protectedKeys?.has(key) && state.indexByKey.has(key);

        if (isProtected) {
            continue;
        }

        if (stickyContainerPool.has(containerIndex)) {
            if (key === undefined || isPendingRemoval) {
                stickyCandidates.push({ containerIndex, distance: Number.POSITIVE_INFINITY });
            }
        } else if (key === undefined || isPendingRemoval) {
            normalCandidates.push({ containerIndex, distance: Number.POSITIVE_INFINITY });
        } else if (!shouldAvoidAssignedContainerReuse) {
            const index = state.indexByKey.get(key);
            if (index !== undefined && (index < startBuffered || index > endBuffered)) {
                const distance = index < startBuffered ? startBuffered - index : index - endBuffered;
                normalCandidates.push({ containerIndex, distance });
            }
        }
    }

    normalCandidates.sort(comparatorByDistance);
    const allocations = new Array<ContainerAllocation>(numNeeded);
    let nextNewContainerIndex = numContainers;
    let pendingRemovalChanged = false;

    const assign = (request: RequestedContainer, containerIndex: number) => {
        allocations[request.order] = {
            containerIndex,
            itemIndex: request.itemIndex,
            itemType: request.itemType,
        };
        if (pendingRemovalSet?.delete(containerIndex)) {
            pendingRemovalChanged = true;
        }
    };

    const assignMatching = (
        pendingRequests: RequestedContainer[],
        candidates: AvailableContainer[],
        matches: (containerType: string | undefined, requestType: string | undefined) => boolean,
    ) => {
        for (const request of pendingRequests) {
            if (allocations[request.order]) {
                continue;
            }

            const candidateIndex = candidates.findIndex((candidate) =>
                matches(containerItemMetadata.get(candidate.containerIndex)?.itemType, request.itemType),
            );
            if (candidateIndex !== -1) {
                const [candidate] = candidates.splice(candidateIndex, 1);
                assign(request, candidate.containerIndex);
            }
        }
    };

    const assignFromPool = (
        pendingRequests: RequestedContainer[],
        candidates: AvailableContainer[],
        allowCrossType: boolean,
    ) => {
        // Run each matching class across the whole batch before moving to the next.
        // Otherwise an early request could retype the exact container needed by a
        // later request. Sticky pools skip the cross-type pass so a mismatched sticky
        // request grows a new type-owned slot instead of retyping an existing one.
        if (getRequiredItemType) {
            assignMatching(
                pendingRequests,
                candidates,
                (containerType, requestType) => requestType !== undefined && containerType === requestType,
            );
        }
        assignMatching(pendingRequests, candidates, (containerType) => containerType === undefined);
        if (allowCrossType) {
            assignMatching(pendingRequests, candidates, () => true);
        }
    };

    assignFromPool(normalRequests, normalCandidates, true);
    assignFromPool(stickyRequests, stickyCandidates, false);

    // Reusable capacity is exhausted at this point. Growing beyond the preallocated
    // budget is valid when no eligible candidate remains, such as during concurrent
    // active/protected demand or a sticky type mismatch. The development warning below
    // makes that exceptional cost visible.
    for (const request of requests) {
        if (allocations[request.order]) {
            continue;
        }

        const containerIndex = nextNewContainerIndex++;
        if (request.isSticky) {
            stickyContainerPool.add(containerIndex);
        }
        assign(request, containerIndex);
    }

    if (pendingRemovalChanged) {
        // The caller owns this queue. Reusing a pending-removal container cancels only
        // that removal while preserving the order of every untouched entry.
        pendingRemoval.length = 0;
        if (pendingRemovalSet) {
            for (const value of pendingRemovalSet) {
                pendingRemoval.push(value);
            }
        }
    }

    if (IS_DEV) {
        const numContainersPooled = peek$(ctx, "numContainersPooled") ?? Number.POSITIVE_INFINITY;
        if (nextNewContainerIndex > numContainersPooled) {
            console.warn(
                "[legend-list] No unused container available, so creating one on demand. This can be a minor performance issue and is likely caused by the estimatedItemSize being too large. Consider decreasing estimatedItemSize.",
                {
                    debugInfo: {
                        numContainers,
                        numContainersPooled,
                        numNeeded,
                        stillNeeded: nextNewContainerIndex - numContainers,
                    },
                },
            );
        }
    }

    return allocations;
}

function comparatorByDistance(a: AvailableContainer, b: AvailableContainer) {
    return b.distance - a.distance;
}
