import { describe, expect, it } from "bun:test";
import {
    appendCalendarMonths,
    CALENDAR_INITIAL_SPAN,
    CALENDAR_PAGE_SIZE,
    CALENDAR_WINDOW_SIZE,
    prependCalendarMonths,
} from "../../example-web/src/examples/infiniteCalendarWindow";
import { buildCalendarMonths, shiftCalendarMonthId } from "../../examples-shared/calendar";

describe("infinite calendar window", () => {
    const today = new Date(2026, 6, 13);
    const initialMonths = buildCalendarMonths(today, CALENDAR_INITIAL_SPAN, today);

    it("uses the full symmetric initial range as its stable window size", () => {
        expect(initialMonths).toHaveLength(CALENDAR_WINDOW_SIZE);
        expect(CALENDAR_WINDOW_SIZE).toBe(25);
    });

    it("preserves the window size when loading older months", () => {
        const olderMonths = prependCalendarMonths(initialMonths, CALENDAR_PAGE_SIZE, today);

        expect(olderMonths).toHaveLength(CALENDAR_WINDOW_SIZE);
        expect(olderMonths[0]?.id).toBe(shiftCalendarMonthId(initialMonths[0]!.id, -CALENDAR_PAGE_SIZE));
        expect(olderMonths.at(-1)?.id).toBe(shiftCalendarMonthId(initialMonths.at(-1)!.id, -CALENDAR_PAGE_SIZE));
    });

    it("preserves the window size when loading newer months", () => {
        const newerMonths = appendCalendarMonths(initialMonths, CALENDAR_PAGE_SIZE, today);

        expect(newerMonths).toHaveLength(CALENDAR_WINDOW_SIZE);
        expect(newerMonths[0]?.id).toBe(shiftCalendarMonthId(initialMonths[0]!.id, CALENDAR_PAGE_SIZE));
        expect(newerMonths.at(-1)?.id).toBe(shiftCalendarMonthId(initialMonths.at(-1)!.id, CALENDAR_PAGE_SIZE));
    });
});
