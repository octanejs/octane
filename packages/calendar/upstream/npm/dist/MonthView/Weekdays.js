import { jsx as _jsx } from "react/jsx-runtime";
import { getMonth, getMonthStart, getYear } from '@wojtekmaj/date-utils';
import clsx from 'clsx';
import Flex from '../Flex.js';
import { formatShortWeekday as defaultFormatShortWeekday, formatWeekday as defaultFormatWeekday, } from '../shared/dateFormatter.js';
import { getDayOfWeek, isCurrentDayOfWeek, isWeekend } from '../shared/dates.js';
const className = 'react-calendar__month-view__weekdays';
const weekdayClassName = `${className}__weekday`;
export default function Weekdays(props) {
    const { calendarType, formatShortWeekday = defaultFormatShortWeekday, formatWeekday = defaultFormatWeekday, locale, onMouseLeave, } = props;
    const anyDate = new Date();
    const beginOfMonth = getMonthStart(anyDate);
    const year = getYear(beginOfMonth);
    const monthIndex = getMonth(beginOfMonth);
    const weekdays = [];
    for (let weekday = 1; weekday <= 7; weekday += 1) {
        const weekdayDate = new Date(year, monthIndex, weekday - getDayOfWeek(beginOfMonth, calendarType));
        const abbr = formatWeekday(locale, weekdayDate);
        weekdays.push(_jsx("div", { className: clsx(weekdayClassName, isCurrentDayOfWeek(weekdayDate) && `${weekdayClassName}--current`, isWeekend(weekdayDate, calendarType) && `${weekdayClassName}--weekend`), children: _jsx("abbr", { "aria-label": abbr, title: abbr, children: formatShortWeekday(locale, weekdayDate).replace('.', '') }) }, weekday));
    }
    return (_jsx(Flex, { className: className, count: 7, onFocus: onMouseLeave, onMouseOver: onMouseLeave, children: weekdays }));
}
