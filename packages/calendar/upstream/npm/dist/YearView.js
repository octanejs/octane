import { jsx as _jsx } from "react/jsx-runtime";
import Months from './YearView/Months.js';
/**
 * Displays a given year.
 */
export default function YearView(props) {
    function renderMonths() {
        return _jsx(Months, { ...props });
    }
    return _jsx("div", { className: "react-calendar__year-view", children: renderMonths() });
}
