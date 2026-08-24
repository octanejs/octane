import { jsx as _jsx } from "react/jsx-runtime";
import { getDate, getDaysInMonth, getMonth, getYear } from '@wojtekmaj/date-utils';
import Flex from '../Flex.js';
import WeekNumber from './WeekNumber.js';
import { getBeginOfWeek, getDayOfWeek, getWeekNumber } from '../shared/dates.js';
export default function WeekNumbers(props) {
    const { activeStartDate, calendarType, onClickWeekNumber, onMouseLeave, showFixedNumberOfWeeks } = props;
    const numberOfWeeks = (() => {
        if (showFixedNumberOfWeeks) {
            return 6;
        }
        const numberOfDays = getDaysInMonth(activeStartDate);
        const startWeekday = getDayOfWeek(activeStartDate, calendarType);
        const days = numberOfDays - (7 - startWeekday);
        return 1 + Math.ceil(days / 7);
    })();
    const dates = (() => {
        const year = getYear(activeStartDate);
        const monthIndex = getMonth(activeStartDate);
        const day = getDate(activeStartDate);
        const result = [];
        for (let index = 0; index < numberOfWeeks; index += 1) {
            result.push(getBeginOfWeek(new Date(year, monthIndex, day + index * 7), calendarType));
        }
        return result;
    })();
    const weekNumbers = dates.map((date) => getWeekNumber(date, calendarType));
    return (_jsx(Flex, { className: "react-calendar__month-view__weekNumbers", count: numberOfWeeks, direction: "column", onFocus: onMouseLeave, onMouseOver: onMouseLeave, style: { flexBasis: 'calc(100% * (1 / 8)', flexShrink: 0 }, children: weekNumbers.map((weekNumber, weekIndex) => {
            const date = dates[weekIndex];
            if (!date) {
                throw new Error('date is not defined');
            }
            return (_jsx(WeekNumber, { date: date, onClickWeekNumber: onClickWeekNumber, weekNumber: weekNumber }, weekNumber));
        }) }));
}
