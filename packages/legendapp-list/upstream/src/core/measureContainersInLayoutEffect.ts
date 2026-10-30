import { setContainerLayoutBaseline } from "@/core/containerLayoutBaseline";
import { type ItemSizeMeasurement, updateItemSizesBatch } from "@/core/updateItemSizes";
import { peek$, type StateContext } from "@/state/state";

export function measureContainersInLayoutEffect(
    ctx: StateContext,
    targetContainerIds: ReadonlySet<number> | null = null,
) {
    const measurements: ItemSizeMeasurement[] = [];
    const containerIds = targetContainerIds ?? ctx.viewRefs.keys();

    for (const containerId of containerIds) {
        const viewRef = ctx.viewRefs.get(containerId);
        const itemKey = peek$(ctx, `containerItemKey${containerId}`);
        const element = viewRef?.current as HTMLElement | null;
        if (itemKey !== undefined && element) {
            const rect = element.getBoundingClientRect();
            // ResizeObserver uses this same border-box baseline to recognize the
            // subsequent observer delivery as confirmation rather than a new change.
            setContainerLayoutBaseline(element, rect);
            measurements.push({
                containerId,
                itemKey,
                size: { height: rect.height, width: rect.width },
            });
        }
    }

    if (measurements.length > 0) {
        updateItemSizesBatch(ctx, measurements);
    }
}
