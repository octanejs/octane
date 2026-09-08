import { jsx as _jsx } from "react/jsx-runtime";
const className = 'react-calendar__tile';
export default function WeekNumber(props) {
    const { onClickWeekNumber, weekNumber } = props;
    const children = _jsx("span", { children: weekNumber });
    if (onClickWeekNumber) {
        const { date, onClickWeekNumber, weekNumber, ...otherProps } = props;
        return (_jsx("button", { ...otherProps, className: className, onClick: (event) => onClickWeekNumber(weekNumber, date, event), type: "button", children: children }));
    }
    else {
        const { date, onClickWeekNumber, weekNumber, ...otherProps } = props;
        return (_jsx("div", { ...otherProps, className: className, children: children }));
    }
}
