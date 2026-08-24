'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import clsx from 'clsx';
import Navigation from './Calendar/Navigation.js';
import CenturyView from './CenturyView.js';
import DecadeView from './DecadeView.js';
import MonthView from './MonthView.js';
import YearView from './YearView.js';
import { getBegin, getBeginNext, getEnd, getValueRange } from './shared/dates.js';
import { between } from './shared/utils.js';
const baseClassName = 'react-calendar';
const allViews = ['century', 'decade', 'year', 'month'];
const allValueTypes = ['decade', 'year', 'month', 'day'];
const defaultMinDate = new Date();
defaultMinDate.setFullYear(1, 0, 1);
defaultMinDate.setHours(0, 0, 0, 0);
const defaultMaxDate = new Date(8.64e15);
function toDate(value) {
    if (value instanceof Date) {
        return value;
    }
    return new Date(value);
}
/**
 * Returns views array with disallowed values cut off.
 */
function getLimitedViews(minDetail, maxDetail) {
    return allViews.slice(allViews.indexOf(minDetail), allViews.indexOf(maxDetail) + 1);
}
/**
 * Determines whether a given view is allowed with currently applied settings.
 */
function isViewAllowed(view, minDetail, maxDetail) {
    const views = getLimitedViews(minDetail, maxDetail);
    return views.indexOf(view) !== -1;
}
/**
 * Gets either provided view if allowed by minDetail and maxDetail, or gets
 * the default view if not allowed.
 */
function getView(view, minDetail, maxDetail) {
    if (!view) {
        return maxDetail;
    }
    if (isViewAllowed(view, minDetail, maxDetail)) {
        return view;
    }
    return maxDetail;
}
/**
 * Returns value type that can be returned with currently applied settings.
 */
function getValueType(view) {
    const index = allViews.indexOf(view);
    return allValueTypes[index];
}
function getValue(value, index) {
    const rawValue = Array.isArray(value) ? value[index] : value;
    if (!rawValue) {
        return null;
    }
    const valueDate = toDate(rawValue);
    if (Number.isNaN(valueDate.getTime())) {
        throw new Error(`Invalid date: ${value}`);
    }
    return valueDate;
}
function getDetailValue({ value, minDate, maxDate, maxDetail }, index) {
    const valuePiece = getValue(value, index);
    if (!valuePiece) {
        return null;
    }
    const valueType = getValueType(maxDetail);
    const detailValueFrom = (() => {
        switch (index) {
            case 0:
                return getBegin(valueType, valuePiece);
            case 1:
                return getEnd(valueType, valuePiece);
            default:
                throw new Error(`Invalid index value: ${index}`);
        }
    })();
    return between(detailValueFrom, minDate, maxDate);
}
const getDetailValueFrom = (args) => getDetailValue(args, 0);
const getDetailValueTo = (args) => getDetailValue(args, 1);
const getDetailValueArray = (args) => [getDetailValueFrom, getDetailValueTo].map((fn) => fn(args));
function getActiveStartDate({ maxDate, maxDetail, minDate, minDetail, value, view, }) {
    const rangeType = getView(view, minDetail, maxDetail);
    const valueFrom = getDetailValueFrom({
        value,
        minDate,
        maxDate,
        maxDetail,
    }) || new Date();
    return getBegin(rangeType, valueFrom);
}
function getInitialActiveStartDate({ activeStartDate, defaultActiveStartDate, defaultValue, defaultView, maxDate, maxDetail, minDate, minDetail, value, view, }) {
    const rangeType = getView(view, minDetail, maxDetail);
    const valueFrom = activeStartDate || defaultActiveStartDate;
    if (valueFrom) {
        return getBegin(rangeType, valueFrom);
    }
    return getActiveStartDate({
        maxDate,
        maxDetail,
        minDate,
        minDetail,
        value: value || defaultValue,
        view: view || defaultView,
    });
}
function getIsSingleValue(value) {
    return value && (!Array.isArray(value) || value.length === 1);
}
function areDatesEqual(date1, date2) {
    return date1 instanceof Date && date2 instanceof Date && date1.getTime() === date2.getTime();
}
const Calendar = forwardRef(function Calendar(props, ref) {
    const { activeStartDate: activeStartDateProps, allowPartialRange, calendarType, className, 'data-testid': dataTestId, defaultActiveStartDate, defaultValue, defaultView, formatDay, formatLongDate, formatMonth, formatMonthYear, formatShortWeekday, formatWeekday, formatYear, goToRangeStartOnSelect = true, inputRef, locale, maxDate = defaultMaxDate, maxDetail = 'month', minDate = defaultMinDate, minDetail = 'century', navigationAriaLabel, navigationAriaLive, navigationLabel, next2AriaLabel, next2Label, nextAriaLabel, nextLabel, onActiveStartDateChange, onChange: onChangeProps, onClickDay, onClickDecade, onClickMonth, onClickWeekNumber, onClickYear, onDrillDown, onDrillUp, onViewChange, prev2AriaLabel, prev2Label, prevAriaLabel, prevLabel, returnValue = 'start', selectRange, showDoubleView, showFixedNumberOfWeeks, showNavigation = true, showNeighboringCentury, showNeighboringDecade, showNeighboringMonth = true, showWeekNumbers, tileClassName, tileContent, tileDisabled, value: valueProps, view: viewProps, } = props;
    const [activeStartDateState, setActiveStartDateState] = useState(defaultActiveStartDate);
    const [hoverState, setHoverState] = useState(null);
    const [valueState, setValueState] = useState(Array.isArray(defaultValue)
        ? defaultValue.map((el) => (el !== null ? toDate(el) : null))
        : defaultValue !== null && defaultValue !== undefined
            ? toDate(defaultValue)
            : null);
    const [viewState, setViewState] = useState(defaultView);
    const activeStartDate = activeStartDateProps ||
        activeStartDateState ||
        getInitialActiveStartDate({
            activeStartDate: activeStartDateProps,
            defaultActiveStartDate,
            defaultValue,
            defaultView,
            maxDate,
            maxDetail,
            minDate,
            minDetail,
            value: valueProps,
            view: viewProps,
        });
    const value = (() => {
        const rawValue = (() => {
            // In the middle of range selection, use value from state
            if (selectRange && getIsSingleValue(valueState)) {
                return valueState;
            }
            return valueProps !== undefined ? valueProps : valueState;
        })();
        if (!rawValue) {
            return null;
        }
        return Array.isArray(rawValue)
            ? rawValue.map((el) => (el !== null ? toDate(el) : null))
            : rawValue !== null
                ? toDate(rawValue)
                : null;
    })();
    const valueType = getValueType(maxDetail);
    const view = getView(viewProps || viewState, minDetail, maxDetail);
    const views = getLimitedViews(minDetail, maxDetail);
    const hover = selectRange ? hoverState : null;
    const drillDownAvailable = views.indexOf(view) < views.length - 1;
    const drillUpAvailable = views.indexOf(view) > 0;
    const getProcessedValue = useCallback((value) => {
        const processFunction = (() => {
            switch (returnValue) {
                case 'start':
                    return getDetailValueFrom;
                case 'end':
                    return getDetailValueTo;
                case 'range':
                    return getDetailValueArray;
                default:
                    throw new Error('Invalid returnValue.');
            }
        })();
        return processFunction({
            maxDate,
            maxDetail,
            minDate,
            value,
        });
    }, [maxDate, maxDetail, minDate, returnValue]);
    const setActiveStartDate = useCallback((nextActiveStartDate, action) => {
        setActiveStartDateState(nextActiveStartDate);
        const args = {
            action,
            activeStartDate: nextActiveStartDate,
            value,
            view,
        };
        if (onActiveStartDateChange && !areDatesEqual(activeStartDate, nextActiveStartDate)) {
            onActiveStartDateChange(args);
        }
    }, [activeStartDate, onActiveStartDateChange, value, view]);
    const onClickTile = useCallback((value, event) => {
        const callback = (() => {
            switch (view) {
                case 'century':
                    return onClickDecade;
                case 'decade':
                    return onClickYear;
                case 'year':
                    return onClickMonth;
                case 'month':
                    return onClickDay;
                default:
                    throw new Error(`Invalid view: ${view}.`);
            }
        })();
        if (callback)
            callback(value, event);
    }, [onClickDay, onClickDecade, onClickMonth, onClickYear, view]);
    const drillDown = useCallback((nextActiveStartDate, event) => {
        if (!drillDownAvailable) {
            return;
        }
        onClickTile(nextActiveStartDate, event);
        const nextView = views[views.indexOf(view) + 1];
        if (!nextView) {
            throw new Error('Attempted to drill down from the lowest view.');
        }
        setActiveStartDateState(nextActiveStartDate);
        setViewState(nextView);
        const args = {
            action: 'drillDown',
            activeStartDate: nextActiveStartDate,
            value,
            view: nextView,
        };
        if (onActiveStartDateChange && !areDatesEqual(activeStartDate, nextActiveStartDate)) {
            onActiveStartDateChange(args);
        }
        if (onViewChange && view !== nextView) {
            onViewChange(args);
        }
        if (onDrillDown) {
            onDrillDown(args);
        }
    }, [
        activeStartDate,
        drillDownAvailable,
        onActiveStartDateChange,
        onClickTile,
        onDrillDown,
        onViewChange,
        value,
        view,
        views,
    ]);
    const drillUp = useCallback(() => {
        if (!drillUpAvailable) {
            return;
        }
        const nextView = views[views.indexOf(view) - 1];
        if (!nextView) {
            throw new Error('Attempted to drill up from the highest view.');
        }
        const nextActiveStartDate = getBegin(nextView, activeStartDate);
        setActiveStartDateState(nextActiveStartDate);
        setViewState(nextView);
        const args = {
            action: 'drillUp',
            activeStartDate: nextActiveStartDate,
            value,
            view: nextView,
        };
        if (onActiveStartDateChange && !areDatesEqual(activeStartDate, nextActiveStartDate)) {
            onActiveStartDateChange(args);
        }
        if (onViewChange && view !== nextView) {
            onViewChange(args);
        }
        if (onDrillUp) {
            onDrillUp(args);
        }
    }, [
        activeStartDate,
        drillUpAvailable,
        onActiveStartDateChange,
        onDrillUp,
        onViewChange,
        value,
        view,
        views,
    ]);
    const onChange = useCallback((rawNextValue, event) => {
        const previousValue = value;
        onClickTile(rawNextValue, event);
        const isFirstValueInRange = selectRange && !getIsSingleValue(previousValue);
        let nextValue;
        if (selectRange) {
            // Range selection turned on
            if (isFirstValueInRange) {
                // Value has 0 or 2 elements - either way we're starting a new array
                // First value
                nextValue = getBegin(valueType, rawNextValue);
            }
            else {
                if (!previousValue) {
                    throw new Error('previousValue is required');
                }
                if (Array.isArray(previousValue)) {
                    throw new Error('previousValue must not be an array');
                }
                // Second value
                nextValue = getValueRange(valueType, previousValue, rawNextValue);
            }
        }
        else {
            // Range selection turned off
            nextValue = getProcessedValue(rawNextValue);
        }
        const nextActiveStartDate = 
        // Range selection turned off
        !selectRange ||
            // Range selection turned on, first value
            isFirstValueInRange ||
            // Range selection turned on, second value, goToRangeStartOnSelect toggled on
            goToRangeStartOnSelect
            ? getActiveStartDate({
                maxDate,
                maxDetail,
                minDate,
                minDetail,
                value: nextValue,
                view,
            })
            : null;
        event.persist();
        setActiveStartDateState(nextActiveStartDate);
        setValueState(nextValue);
        const args = {
            action: 'onChange',
            activeStartDate: nextActiveStartDate,
            value: nextValue,
            view,
        };
        if (onActiveStartDateChange && !areDatesEqual(activeStartDate, nextActiveStartDate)) {
            onActiveStartDateChange(args);
        }
        if (onChangeProps) {
            if (selectRange) {
                const isSingleValue = getIsSingleValue(nextValue);
                if (!isSingleValue) {
                    onChangeProps(nextValue || null, event);
                }
                else if (allowPartialRange) {
                    if (Array.isArray(nextValue)) {
                        throw new Error('value must not be an array');
                    }
                    onChangeProps([nextValue || null, null], event);
                }
            }
            else {
                onChangeProps(nextValue || null, event);
            }
        }
    }, [
        activeStartDate,
        allowPartialRange,
        getProcessedValue,
        goToRangeStartOnSelect,
        maxDate,
        maxDetail,
        minDate,
        minDetail,
        onActiveStartDateChange,
        onChangeProps,
        onClickTile,
        selectRange,
        value,
        valueType,
        view,
    ]);
    function onMouseOver(nextHover) {
        setHoverState(nextHover);
    }
    function onMouseLeave() {
        setHoverState(null);
    }
    useImperativeHandle(ref, () => ({
        activeStartDate,
        drillDown,
        drillUp,
        onChange,
        setActiveStartDate,
        value,
        view,
    }), [activeStartDate, drillDown, drillUp, onChange, setActiveStartDate, value, view]);
    function renderContent(next) {
        const currentActiveStartDate = next
            ? getBeginNext(view, activeStartDate)
            : getBegin(view, activeStartDate);
        const onClick = drillDownAvailable ? drillDown : onChange;
        const commonProps = {
            activeStartDate: currentActiveStartDate,
            hover,
            locale,
            maxDate,
            minDate,
            onClick,
            onMouseOver: selectRange ? onMouseOver : undefined,
            tileClassName,
            tileContent,
            tileDisabled,
            value,
            valueType,
        };
        switch (view) {
            case 'century': {
                return (_jsx(CenturyView, { formatYear: formatYear, showNeighboringCentury: showNeighboringCentury, ...commonProps }));
            }
            case 'decade': {
                return (_jsx(DecadeView, { formatYear: formatYear, showNeighboringDecade: showNeighboringDecade, ...commonProps }));
            }
            case 'year': {
                return (_jsx(YearView, { formatMonth: formatMonth, formatMonthYear: formatMonthYear, ...commonProps }));
            }
            case 'month': {
                return (_jsx(MonthView, { calendarType: calendarType, formatDay: formatDay, formatLongDate: formatLongDate, formatShortWeekday: formatShortWeekday, formatWeekday: formatWeekday, onClickWeekNumber: onClickWeekNumber, onMouseLeave: selectRange ? onMouseLeave : undefined, showFixedNumberOfWeeks: typeof showFixedNumberOfWeeks !== 'undefined'
                        ? showFixedNumberOfWeeks
                        : showDoubleView, showNeighboringMonth: showNeighboringMonth, showWeekNumbers: showWeekNumbers, ...commonProps }));
            }
            default:
                throw new Error(`Invalid view: ${view}.`);
        }
    }
    function renderNavigation() {
        if (!showNavigation) {
            return null;
        }
        return (_jsx(Navigation, { activeStartDate: activeStartDate, drillUp: drillUp, formatMonthYear: formatMonthYear, formatYear: formatYear, locale: locale, maxDate: maxDate, minDate: minDate, navigationAriaLabel: navigationAriaLabel, navigationAriaLive: navigationAriaLive, navigationLabel: navigationLabel, next2AriaLabel: next2AriaLabel, next2Label: next2Label, nextAriaLabel: nextAriaLabel, nextLabel: nextLabel, prev2AriaLabel: prev2AriaLabel, prev2Label: prev2Label, prevAriaLabel: prevAriaLabel, prevLabel: prevLabel, setActiveStartDate: setActiveStartDate, showDoubleView: showDoubleView, view: view, views: views }));
    }
    const valueArray = Array.isArray(value) ? value : [value];
    return (_jsxs("div", { className: clsx(baseClassName, selectRange && valueArray.length === 1 && `${baseClassName}--selectRange`, showDoubleView && `${baseClassName}--doubleView`, className), "data-testid": dataTestId, ref: inputRef, children: [renderNavigation(), _jsxs("div", { className: `${baseClassName}__viewContainer`, onBlur: selectRange ? onMouseLeave : undefined, onMouseLeave: selectRange ? onMouseLeave : undefined, children: [renderContent(), showDoubleView ? renderContent(true) : null] })] }));
});
export default Calendar;
