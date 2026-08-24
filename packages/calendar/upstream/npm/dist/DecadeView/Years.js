import { jsx as _jsx } from "react/jsx-runtime";
import { getYearStart } from '@wojtekmaj/date-utils';
import TileGroup from '../TileGroup.js';
import Year from './Year.js';
import { getBeginOfDecadeYear } from '../shared/dates.js';
export default function Years(props) {
    const { activeStartDate, hover, showNeighboringDecade, value, valueType, ...otherProps } = props;
    const start = getBeginOfDecadeYear(activeStartDate);
    const end = start + (showNeighboringDecade ? 11 : 9);
    return (_jsx(TileGroup, { className: "react-calendar__decade-view__years", dateTransform: getYearStart, dateType: "year", end: end, hover: hover, renderTile: ({ date, ...otherTileProps }) => (_jsx(Year, { ...otherProps, ...otherTileProps, activeStartDate: activeStartDate, currentDecade: start, date: date }, date.getTime())), start: start, value: value, valueType: valueType }));
}
