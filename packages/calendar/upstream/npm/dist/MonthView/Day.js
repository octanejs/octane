import { jsx as _jsx } from "react/jsx-runtime";
import { getDayEnd, getDayStart } from '@wojtekmaj/date-utils';
import Tile from '../Tile.js';
import { formatDay as defaultFormatDay, formatLongDate as defaultFormatLongDate, } from '../shared/dateFormatter.js';
import { isWeekend } from '../shared/dates.js';
const className = 'react-calendar__month-view__days__day';
export default function Day({ calendarType, classes = [], currentMonthIndex, formatDay = defaultFormatDay, formatLongDate = defaultFormatLongDate, ...otherProps }) {
    const { date, locale } = otherProps;
    const classesProps = [];
    if (classes) {
        classesProps.push(...classes);
    }
    if (className) {
        classesProps.push(className);
    }
    if (isWeekend(date, calendarType)) {
        classesProps.push(`${className}--weekend`);
    }
    if (date.getMonth() !== currentMonthIndex) {
        classesProps.push(`${className}--neighboringMonth`);
    }
    return (_jsx(Tile, { ...otherProps, classes: classesProps, formatAbbr: formatLongDate, maxDateTransform: getDayEnd, minDateTransform: getDayStart, view: "month", children: formatDay(locale, date) }));
}
