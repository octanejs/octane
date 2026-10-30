import { describe, expect, it, mock, spyOn } from "bun:test";
import "../setup";

import * as calculateItemsInViewModule from "../../src/core/calculateItemsInView";
import { getContainerLayoutBaseline } from "../../src/core/containerLayoutBaseline";
import { createMockContext } from "../__mocks__/createMockContext";

describe("measureContainersInLayoutEffect web", () => {
    it("records the measured layout for the ResizeObserver baseline", async () => {
        const { measureContainersInLayoutEffect } = await import(
            "../../src/core/measureContainersInLayoutEffect.ts?web-layout-baseline"
        );
        const calculateSpy = spyOn(calculateItemsInViewModule, "calculateItemsInView").mockImplementation(() => {});
        const ctx = createMockContext(
            {
                containerItemKey0: "item_0",
                otherAxisSize: 400,
                readyToRender: true,
            },
            {
                didContainersLayout: true,
                endBuffered: 0,
                indexByKey: new Map([["item_0", 0]]),
                props: {
                    data: [{ id: "item_0" }],
                    estimatedItemSize: 100,
                },
                sizes: new Map([["item_0", 100]]),
                sizesKnown: new Map([["item_0", 100]]),
                startBuffered: 0,
            },
        );
        const rect = { height: 180, width: 320 } as DOMRect;
        const getBoundingClientRect = mock(() => rect);
        const element = { getBoundingClientRect } as HTMLElement;
        ctx.state.containerItemKeys.set("item_0", 0);
        ctx.viewRefs.set(0, { current: element } as any);

        measureContainersInLayoutEffect(ctx);

        expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
        expect(getContainerLayoutBaseline(element)).toBe(rect);
        expect(ctx.state.sizesKnown.get("item_0")).toBe(180);
        expect(calculateSpy).toHaveBeenCalledTimes(1);
        calculateSpy.mockRestore();
    });
});
