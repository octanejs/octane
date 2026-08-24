import { jsx as _jsx } from "react/jsx-runtime";
import { getDecadeStart } from '@wojtekmaj/date-utils';
import TileGroup from '../TileGroup.js';
import Decade from './Decade.js';
import { getBeginOfCenturyYear } from '../shared/dates.js';
export default function Decades(props) {
    const { activeStartDate, hover, showNeighboringCentury, value, valueType, ...otherProps } = props;
    const start = getBeginOfCenturyYear(activeStartDate);
    const end = start + (showNeighboringCentury ? 119 : 99);
    return (_jsx(TileGroup, { className: "react-calendar__century-view__decades", dateTransform: getDecadeStart, dateType: "decade", end: end, hover: hover, renderTile: ({ date, ...otherTileProps }) => (_jsx(Decade, { ...otherProps, ...otherTileProps, activeStartDate: activeStartDate, currentCentury: start, date: date }, date.getTime())), start: start, step: 10, value: value, valueType: valueType }));
}
