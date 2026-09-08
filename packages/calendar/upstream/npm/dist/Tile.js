import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import clsx from 'clsx';
export default function Tile(props) {
    const { activeStartDate, children, classes, date, formatAbbr, locale, maxDate, maxDateTransform, minDate, minDateTransform, onClick, onMouseOver, style, tileClassName: tileClassNameProps, tileContent: tileContentProps, tileDisabled, view, } = props;
    const tileClassName = useMemo(() => {
        const args = { activeStartDate, date, view };
        return typeof tileClassNameProps === 'function' ? tileClassNameProps(args) : tileClassNameProps;
    }, [activeStartDate, date, tileClassNameProps, view]);
    const tileContent = useMemo(() => {
        const args = { activeStartDate, date, view };
        return typeof tileContentProps === 'function' ? tileContentProps(args) : tileContentProps;
    }, [activeStartDate, date, tileContentProps, view]);
    return (_jsxs("button", { className: clsx(classes, tileClassName), disabled: (minDate && minDateTransform(minDate) > date) ||
            (maxDate && maxDateTransform(maxDate) < date) ||
            (tileDisabled === null || tileDisabled === void 0 ? void 0 : tileDisabled({ activeStartDate, date, view })), onClick: onClick ? (event) => onClick(date, event) : undefined, onFocus: onMouseOver ? () => onMouseOver(date) : undefined, onMouseOver: onMouseOver ? () => onMouseOver(date) : undefined, style: style, type: "button", children: [formatAbbr ? _jsx("abbr", { "aria-label": formatAbbr(locale, date), children: children }) : children, tileContent] }));
}
