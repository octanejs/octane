import { jsx as _jsx } from "react/jsx-runtime";
import { getDayStart, getDaysInMonth, getMonth, getYear } from '@wojtekmaj/date-utils';
import TileGroup from '../TileGroup.js';
import Day from './Day.js';
import { getDayOfWeek } from '../shared/dates.js';
export default function Days(props) {
    const { activeStartDate, calendarType, hover, showFixedNumberOfWeeks, showNeighboringMonth, value, valueType, ...otherProps } = props;
    const year = getYear(activeStartDate);
    const monthIndex = getMonth(activeStartDate);
    const hasFixedNumberOfWeeks = showFixedNumberOfWeeks || showNeighboringMonth;
    const dayOfWeek = getDayOfWeek(activeStartDate, calendarType);
    const offset = hasFixedNumberOfWeeks ? 0 : dayOfWeek;
    /**
     * Defines on which day of the month the grid shall start. If we simply show current
     * month, we obviously start on day one, but if showNeighboringMonth is set to
     * true, we need to find the beginning of the week the first day of the month is in.
     */
    const start = (hasFixedNumberOfWeeks ? -dayOfWeek : 0) + 1;
    /**
     * Defines on which day of the month the grid shall end. If we simply show current
     * month, we need to stop on the last day of the month, but if showNeighboringMonth
     * is set to true, we need to find the end of the week the last day of the month is in.
     */
    const end = (() => {
        if (showFixedNumberOfWeeks) {
            // Always show 6 weeks
            return start + 6 * 7 - 1;
        }
        const daysInMonth = getDaysInMonth(activeStartDate);
        if (showNeighboringMonth) {
            const activeEndDate = new Date();
            activeEndDate.setFullYear(year, monthIndex, daysInMonth);
            activeEndDate.setHours(0, 0, 0, 0);
            const daysUntilEndOfTheWeek = 7 - getDayOfWeek(activeEndDate, calendarType) - 1;
            return daysInMonth + daysUntilEndOfTheWeek;
        }
        return daysInMonth;
    })();
    return (_jsx(TileGroup, { className: "react-calendar__month-view__days", count: 7, dateTransform: (day) => {
            const date = new Date();
            date.setFullYear(year, monthIndex, day);
            return getDayStart(date);
        }, dateType: "day", hover: hover, end: end, renderTile: ({ date, ...otherTileProps }) => (_jsx(Day, { ...otherProps, ...otherTileProps, activeStartDate: activeStartDate, calendarType: calendarType, currentMonthIndex: monthIndex, date: date }, date.getTime())), offset: offset, start: start, value: value, valueType: valueType }));
}
