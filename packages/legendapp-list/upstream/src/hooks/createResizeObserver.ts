import { batchItemSizeUpdates } from "@/core/updateItemSizes";

let globalResizeObserver: ResizeObserver | null = null;

function getGlobalResizeObserver(): ResizeObserver {
    if (!globalResizeObserver) {
        globalResizeObserver = new ResizeObserver((entries) => {
            // One delivery can contain rows from several lists. Grouping all callbacks
            // here lets updateItemSizes flush once per list instead of once per entry.
            batchItemSizeUpdates(() => {
                for (const entry of entries) {
                    const callbacks = callbackMap.get(entry.target);
                    if (callbacks) {
                        for (const callback of callbacks) {
                            callback(entry);
                        }
                    }
                }
            });
        });
    }
    return globalResizeObserver;
}

const callbackMap = new WeakMap<Element, Set<(entry: ResizeObserverEntry) => void>>();

export function createResizeObserver(
    element: Element | null,
    callback: (entry: ResizeObserverEntry) => void,
): () => void {
    if (typeof ResizeObserver === "undefined" || !element) {
        // Tests and native environments without a DOM don't expose ResizeObserver.
        return () => {};
    }

    const observer = getGlobalResizeObserver();

    const callbacks = callbackMap.get(element) ?? new Set();
    if (callbacks.size === 0) {
        callbackMap.set(element, callbacks);
        // Parent layout-effect measurement uses getBoundingClientRect, so observing the
        // border box keeps both paths on identical geometry, including padding and gaps.
        observer.observe(element, { box: "border-box" });
    }

    callbacks.add(callback);

    return () => {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
            callbackMap.delete(element);
            observer.unobserve(element);
        }
    };
}
