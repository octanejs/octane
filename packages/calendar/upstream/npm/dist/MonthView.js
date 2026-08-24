import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
import Days from './MonthView/Days.js';
import Weekdays from './MonthView/Weekdays.js';
import WeekNumbers from './MonthView/WeekNumbers.js';
import { CALENDAR_TYPE_LOCALES, CALENDAR_TYPES } from './shared/const.js';
function getCalendarTypeFromLocale(locale) {
    if (locale) {
        for (const [calendarType, locales] of Object.entries(CALENDAR_TYPE_LOCALES)) {
            if (locales.includes(locale)) {
                return calendarType;
            }
        }
    }
    return CALENDAR_TYPES.ISO_8601;
}
/**
 * Displays a given month.
 */
export default function MonthView(props) {
    const { activeStartDate, locale, onMouseLeave, showFixedNumberOfWeeks } = props;
    const { calendarType = getCalendarTypeFromLocale(locale), formatShortWeekday, formatWeekday, onClickWeekNumber, showWeekNumbers, ...childProps } = props;
    function renderWeekdays() {
        return (_jsx(Weekdays, { calendarType: calendarType, formatShortWeekday: formatShortWeekday, formatWeekday: formatWeekday, locale: locale, onMouseLeave: onMouseLeave }));
    }
    function renderWeekNumbers() {
        if (!showWeekNumbers) {
            return null;
        }
        return (_jsx(WeekNumbers, { activeStartDate: activeStartDate, calendarType: calendarType, onClickWeekNumber: onClickWeekNumber, onMouseLeave: onMouseLeave, showFixedNumberOfWeeks: showFixedNumberOfWeeks }));
    }
    function renderDays() {
        return _jsx(Days, { calendarType: calendarType, ...childProps });
    }
    const className = 'react-calendar__month-view';
    return (_jsx("div", { className: clsx(className, showWeekNumbers ? `${className}--weekNumbers` : ''), children: _jsxs("div", { style: {
                display: 'flex',
                alignItems: 'flex-end',
            }, children: [renderWeekNumbers(), _jsxs("div", { style: {
                        flexGrow: 1,
                        width: '100%',
                    }, children: [renderWeekdays(), renderDays()] })] }) }));
}
