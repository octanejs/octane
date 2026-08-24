import { jsx as _jsx } from "react/jsx-runtime";
import Years from './DecadeView/Years.js';
/**
 * Displays a given decade.
 */
export default function DecadeView(props) {
    function renderYears() {
        return _jsx(Years, { ...props });
    }
    return _jsx("div", { className: "react-calendar__decade-view", children: renderYears() });
}
