import { describe, expect, it } from "bun:test";
import "../setup";

import { checkThresholds } from "../../src/utils/checkThresholds";
import { createMockContext } from "../__mocks__/createMockContext";

describe("checkThresholds", () => {
    it("does not switch directly from start reached to end reached after an MVCP data shift", () => {
        const startCalls: number[] = [];
        const endCalls: number[] = [];
        const ctx = createMockContext(
            { footerSize: 0, headerSize: 0, stylePaddingTop: 0, totalSize: 3840 },
            {
                isEndReached: false,
                isStartReached: false,
                props: {
                    data: Array.from({ length: 12 }, (_, index) => ({ id: index })),
                    onEndReached: ({ distanceFromEnd }) => endCalls.push(distanceFromEnd),
                    onEndReachedThreshold: 0.25,
                    onStartReached: ({ distanceFromStart }) => startCalls.push(distanceFromStart),
                    onStartReachedThreshold: 0.25,
                },
                queuedInitialLayout: true,
                scroll: 223.5,
                scrollLength: 1409,
                totalSize: 3840,
            },
        );

        checkThresholds(ctx);

        expect(startCalls).toEqual([223.5]);
        expect(endCalls).toEqual([]);
        expect(ctx.state.edgeReachedGate).toBe("closed");

        // A six-item prepend moves the retained anchor by 1920px. This lands inside
        // the opposite threshold, but it is still part of the same reached gesture.
        ctx.state.scroll = 2143.5;
        checkThresholds(ctx);

        expect(startCalls).toEqual([223.5]);
        expect(endCalls).toEqual([]);
        expect(ctx.state.edgeReachedGate).toBe("closed");
    });
});
