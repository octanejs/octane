import type { ContainerItemMetadata, InternalState } from "@/types.internal";

export function createContainerItemMetadata(
    state: InternalState,
    itemIndex: number,
    itemData: any,
    itemType?: string,
): ContainerItemMetadata {
    return {
        dataChangeEpoch: state.dataChangeEpoch,
        getFixedItemSize: state.props.getFixedItemSize,
        getItemType: state.props.getItemType,
        itemData,
        itemIndex,
        itemType,
    };
}

export function resolveContainerItemMetadata(
    state: InternalState,
    containerId: number,
    itemIndex: number,
    itemData: any,
) {
    const { getFixedItemSize, getItemType } = state.props;
    const previousMetadata = state.containerItemMetadata.get(containerId);
    let metadata: ContainerItemMetadata;
    if (
        previousMetadata?.dataChangeEpoch === state.dataChangeEpoch &&
        previousMetadata.getItemType === getItemType &&
        previousMetadata.itemData === itemData &&
        previousMetadata.itemIndex === itemIndex
    ) {
        metadata = previousMetadata;
    } else {
        const itemType = getItemType ? (getItemType(itemData, itemIndex) ?? "") : undefined;
        metadata = createContainerItemMetadata(state, itemIndex, itemData, itemType);
        state.containerItemMetadata.set(containerId, metadata);
    }

    if (metadata.getFixedItemSize !== getFixedItemSize) {
        metadata.didResolveFixedItemSize = false;
        metadata.fixedItemSize = undefined;
        metadata.getFixedItemSize = getFixedItemSize;
    }
    if (getFixedItemSize && !metadata.didResolveFixedItemSize) {
        // The flag also caches an intentional undefined result for dynamic items.
        metadata.fixedItemSize = getFixedItemSize(itemData, itemIndex, metadata.itemType ?? "");
        metadata.didResolveFixedItemSize = true;
    }

    return metadata;
}

export function invalidateContainerFixedItemSizes(state: InternalState) {
    for (const metadata of state.containerItemMetadata.values()) {
        metadata.didResolveFixedItemSize = false;
        metadata.fixedItemSize = undefined;
    }
}
