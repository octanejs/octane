import { jsx as _jsx } from "react/jsx-runtime";
import { getCenturyStart, getDecadeEnd, getDecadeStart } from '@wojtekmaj/date-utils';
import Tile from '../Tile.js';
import { formatYear as defaultFormatYear } from '../shared/dateFormatter.js';
import { getDecadeLabel } from '../shared/dates.js';
const className = 'react-calendar__century-view__decades__decade';
export default function Decade({ classes = [], currentCentury, formatYear = defaultFormatYear, ...otherProps }) {
    const { date, locale } = otherProps;
    const classesProps = [];
    if (classes) {
        classesProps.push(...classes);
    }
    if (className) {
        classesProps.push(className);
    }
    if (getCenturyStart(date).getFullYear() !== currentCentury) {
        classesProps.push(`${className}--neighboringCentury`);
    }
    return (_jsx(Tile, { ...otherProps, classes: classesProps, maxDateTransform: getDecadeEnd, minDateTransform: getDecadeStart, view: "century", children: getDecadeLabel(locale, formatYear, date) }));
}
