import { jsx as _jsx } from "react/jsx-runtime";
import { getMonthEnd, getMonthStart } from '@wojtekmaj/date-utils';
import Tile from '../Tile.js';
import { formatMonth as defaultFormatMonth, formatMonthYear as defaultFormatMonthYear, } from '../shared/dateFormatter.js';
const className = 'react-calendar__year-view__months__month';
export default function Month({ classes = [], formatMonth = defaultFormatMonth, formatMonthYear = defaultFormatMonthYear, ...otherProps }) {
    const { date, locale } = otherProps;
    return (_jsx(Tile, { ...otherProps, classes: [...classes, className], formatAbbr: formatMonthYear, maxDateTransform: getMonthEnd, minDateTransform: getMonthStart, view: "year", children: formatMonth(locale, date) }));
}
