import type { Range, RangeType, Value } from './types.js';
/**
 * Returns a value no smaller than min and no larger than max.
 *
 * @param {Date} value Value to return.
 * @param {Date} min Minimum return value.
 * @param {Date} max Maximum return value.
 * @returns {Date} Value between min and max.
 */
export declare function between<T extends Date>(value: T, min?: T | null, max?: T | null): T;
export declare function isValueWithinRange(value: Date, range: Range<Date>): boolean;
export declare function isRangeWithinRange(greaterRange: Range<Date>, smallerRange: Range<Date>): boolean;
export declare function doRangesOverlap(range1: Range<Date>, range2: Range<Date>): boolean;
export declare function getTileClasses(args: {
    date?: Date | Range<Date>;
    dateType?: RangeType;
    hover?: Date | null;
    value?: Value;
    valueType?: RangeType;
}): string[];
