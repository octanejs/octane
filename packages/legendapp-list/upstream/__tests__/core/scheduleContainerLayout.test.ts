import { describe, expect, it } from "bun:test";
import "../setup";

import { getContainerLayoutEffectScope, scheduleContainerLayout } from "../../src/core/scheduleContainerLayout";
import { createMockContext } from "../__mocks__/createMockContext";

describe("scheduleContainerLayout", () => {
    it("coalesces container ids into one scheduled layout epoch", () => {
        const ctx = createMockContext({ containerLayoutEpoch: 0 });

        expect(getContainerLayoutEffectScope(ctx)).toBeUndefined();

        scheduleContainerLayout(ctx, 0);
        scheduleContainerLayout(ctx, 1);

        expect(ctx.values.get("containerLayoutEpoch")).toBe(1);
        expect(getContainerLayoutEffectScope(ctx)).toEqual(new Set([0, 1]));

        scheduleContainerLayout(ctx, new Set([2]));
        expect(ctx.values.get("containerLayoutEpoch")).toBe(2);
        expect(getContainerLayoutEffectScope(ctx)).toEqual(new Set([2]));
    });

    it("merges single container ids into an owned copy of a scheduled batch", () => {
        const ctx = createMockContext({ containerLayoutEpoch: 0 });
        const batch = new Set([0, 1]);

        scheduleContainerLayout(ctx, batch);
        scheduleContainerLayout(ctx, 2);

        expect(getContainerLayoutEffectScope(ctx)).toEqual(new Set([0, 1, 2]));
        expect(batch).toEqual(new Set([0, 1]));
    });

    it("keeps an all-container request while coalescing later ids", () => {
        const ctx = createMockContext({ containerLayoutEpoch: 0 });

        scheduleContainerLayout(ctx);
        scheduleContainerLayout(ctx, new Set([1]));

        expect(ctx.values.get("containerLayoutEpoch")).toBe(1);
        expect(getContainerLayoutEffectScope(ctx)).toBeNull();
    });
});
