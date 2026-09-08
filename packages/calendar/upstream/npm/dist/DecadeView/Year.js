import { jsx as _jsx } from "react/jsx-runtime";
import { getDecadeStart, getYearEnd, getYearStart } from '@wojtekmaj/date-utils';
import Tile from '../Tile.js';
import { formatYear as defaultFormatYear } from '../shared/dateFormatter.js';
const className = 'react-calendar__decade-view__years__year';
export default function Year({ classes = [], currentDecade, formatYear = defaultFormatYear, ...otherProps }) {
    const { date, locale } = otherProps;
    const classesProps = [];
    if (classes) {
        classesProps.push(...classes);
    }
    if (className) {
        classesProps.push(className);
    }
    if (getDecadeStart(date).getFullYear() !== currentDecade) {
        classesProps.push(`${className}--neighboringDecade`);
    }
    return (_jsx(Tile, { ...otherProps, classes: classesProps, maxDateTransform: getYearEnd, minDateTransform: getYearStart, view: "decade", children: formatYear(locale, date) }));
}
