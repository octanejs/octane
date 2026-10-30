import { type RefObject, useEffect, useRef } from "react";

import { Platform } from "@/platform/Platform";
import { listen$, peek$, useStateContext } from "@/state/state";
import { sortDOMElements } from "@/utils/reordering";

export function useDOMOrder(ref: RefObject<HTMLDivElement | null>) {
    const ctx = useStateContext();
    const debounceRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (Platform.OS !== "web") {
            return;
        }

        const unsubscribe = listen$(ctx, "lastPositionUpdate", () => {
            // Clear existing timeout
            if (debounceRef.current !== undefined) {
                clearTimeout(debounceRef.current);
            }

            // Schedule reordering to run 500ms after the last position change
            debounceRef.current = setTimeout(() => {
                const parent = ref.current;
                if (parent) {
                    const indexByElement = new Map<HTMLElement, number>();
                    for (const [containerId, viewRef] of ctx.viewRefs) {
                        const element = viewRef.current as HTMLElement | null;
                        const index = peek$(ctx, `containerItemIndex${containerId}`);
                        if (element && index !== undefined) {
                            indexByElement.set(element, index);
                        }
                    }
                    sortDOMElements(parent, indexByElement);
                }
                debounceRef.current = undefined;
            }, 500) as unknown as number;
        });

        return () => {
            unsubscribe();
            if (debounceRef.current !== undefined) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [ctx]);
}
