import { getRange } from './dates.js';
/**
 * Returns a value no smaller than min and no larger than max.
 *
 * @param {Date} value Value to return.
 * @param {Date} min Minimum return value.
 * @param {Date} max Maximum return value.
 * @returns {Date} Value between min and max.
 */
export function between(value, min, max) {
    if (min && min > value) {
        return min;
    }
    if (max && max < value) {
        return max;
    }
    return value;
}
export function isValueWithinRange(value, range) {
    return range[0] <= value && range[1] >= value;
}
export function isRangeWithinRange(greaterRange, smallerRange) {
    return greaterRange[0] <= smallerRange[0] && greaterRange[1] >= smallerRange[1];
}
export function doRangesOverlap(range1, range2) {
    return isValueWithinRange(range1[0], range2) || isValueWithinRange(range1[1], range2);
}
function getRangeClassNames(valueRange, dateRange, baseClassName) {
    const isRange = doRangesOverlap(dateRange, valueRange);
    const classes = [];
    if (isRange) {
        classes.push(baseClassName);
        const isRangeStart = isValueWithinRange(valueRange[0], dateRange);
        const isRangeEnd = isValueWithinRange(valueRange[1], dateRange);
        if (isRangeStart) {
            classes.push(`${baseClassName}Start`);
        }
        if (isRangeEnd) {
            classes.push(`${baseClassName}End`);
        }
        if (isRangeStart && isRangeEnd) {
            classes.push(`${baseClassName}BothEnds`);
        }
    }
    return classes;
}
function isCompleteValue(value) {
    if (Array.isArray(value)) {
        return value[0] !== null && value[1] !== null;
    }
    return value !== null;
}
export function getTileClasses(args) {
    if (!args) {
        throw new Error('args is required');
    }
    const { value, date, hover } = args;
    const className = 'react-calendar__tile';
    const classes = [className];
    if (!date) {
        return classes;
    }
    const now = new Date();
    const dateRange = (() => {
        if (Array.isArray(date)) {
            return date;
        }
        const { dateType } = args;
        if (!dateType) {
            throw new Error('dateType is required when date is not an array of two dates');
        }
        return getRange(dateType, date);
    })();
    if (isValueWithinRange(now, dateRange)) {
        classes.push(`${className}--now`);
    }
    if (!value || !isCompleteValue(value)) {
        return classes;
    }
    const valueRange = (() => {
        if (Array.isArray(value)) {
            return value;
        }
        const { valueType } = args;
        if (!valueType) {
            throw new Error('valueType is required when value is not an array of two dates');
        }
        return getRange(valueType, value);
    })();
    if (isRangeWithinRange(valueRange, dateRange)) {
        classes.push(`${className}--active`);
    }
    else if (doRangesOverlap(valueRange, dateRange)) {
        classes.push(`${className}--hasActive`);
    }
    const valueRangeClassNames = getRangeClassNames(valueRange, dateRange, `${className}--range`);
    classes.push(...valueRangeClassNames);
    const valueArray = Array.isArray(value) ? value : [value];
    if (hover && valueArray.length === 1) {
        const hoverRange = hover > valueRange[0] ? [valueRange[0], hover] : [hover, valueRange[0]];
        const hoverRangeClassNames = getRangeClassNames(hoverRange, dateRange, `${className}--hover`);
        classes.push(...hoverRangeClassNames);
    }
    return classes;
}
