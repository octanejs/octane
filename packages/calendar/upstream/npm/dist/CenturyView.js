import { jsx as _jsx } from "react/jsx-runtime";
import Decades from './CenturyView/Decades.js';
/**
 * Displays a given century.
 */
export default function CenturyView(props) {
    function renderDecades() {
        return _jsx(Decades, { ...props });
    }
    return _jsx("div", { className: "react-calendar__century-view", children: renderDecades() });
}
