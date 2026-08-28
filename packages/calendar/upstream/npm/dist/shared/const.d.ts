import type { CalendarType } from './types.js';
export declare const CALENDAR_TYPES: {
    readonly GREGORY: "gregory";
    readonly HEBREW: "hebrew";
    readonly ISLAMIC: "islamic";
    readonly ISO_8601: "iso8601";
};
export declare const CALENDAR_TYPE_LOCALES: Partial<Record<CalendarType, string[]>>;
export declare const WEEKDAYS: readonly [0, 1, 2, 3, 4, 5, 6];
