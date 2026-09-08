import { jsx as _jsx } from "react/jsx-runtime";
import { getMonthStart, getYear } from '@wojtekmaj/date-utils';
import TileGroup from '../TileGroup.js';
import Month from './Month.js';
export default function Months(props) {
    const { activeStartDate, hover, value, valueType, ...otherProps } = props;
    const start = 0;
    const end = 11;
    const year = getYear(activeStartDate);
    return (_jsx(TileGroup, { className: "react-calendar__year-view__months", dateTransform: (monthIndex) => {
            const date = new Date();
            date.setFullYear(year, monthIndex, 1);
            return getMonthStart(date);
        }, dateType: "month", end: end, hover: hover, renderTile: ({ date, ...otherTileProps }) => (_jsx(Month, { ...otherProps, ...otherTileProps, activeStartDate: activeStartDate, date: date }, date.getTime())), start: start, value: value, valueType: valueType }));
}
