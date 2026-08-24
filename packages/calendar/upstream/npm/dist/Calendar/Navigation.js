'use client';
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { getUserLocale } from 'get-user-locale';
import { formatMonthYear as defaultFormatMonthYear, formatYear as defaultFormatYear, } from '../shared/dateFormatter.js';
import { getBeginNext, getBeginNext2, getBeginPrevious, getBeginPrevious2, getCenturyLabel, getDecadeLabel, getEndPrevious, getEndPrevious2, } from '../shared/dates.js';
const className = 'react-calendar__navigation';
export default function Navigation({ activeStartDate, drillUp, formatMonthYear = defaultFormatMonthYear, formatYear = defaultFormatYear, locale, maxDate, minDate, navigationAriaLabel = '', navigationAriaLive, navigationLabel, next2AriaLabel = '', next2Label = '»', nextAriaLabel = '', nextLabel = '›', prev2AriaLabel = '', prev2Label = '«', prevAriaLabel = '', prevLabel = '‹', setActiveStartDate, showDoubleView, view, views, }) {
    const drillUpAvailable = views.indexOf(view) > 0;
    const shouldShowPrevNext2Buttons = view !== 'century';
    const previousActiveStartDate = getBeginPrevious(view, activeStartDate);
    const previousActiveStartDate2 = shouldShowPrevNext2Buttons
        ? getBeginPrevious2(view, activeStartDate)
        : undefined;
    const nextActiveStartDate = getBeginNext(view, activeStartDate);
    const nextActiveStartDate2 = shouldShowPrevNext2Buttons
        ? getBeginNext2(view, activeStartDate)
        : undefined;
    const prevButtonDisabled = (() => {
        if (previousActiveStartDate.getFullYear() < 0) {
            return true;
        }
        const previousActiveEndDate = getEndPrevious(view, activeStartDate);
        return minDate && minDate >= previousActiveEndDate;
    })();
    const prev2ButtonDisabled = shouldShowPrevNext2Buttons &&
        (() => {
            if (previousActiveStartDate2.getFullYear() < 0) {
                return true;
            }
            const previousActiveEndDate = getEndPrevious2(view, activeStartDate);
            return minDate && minDate >= previousActiveEndDate;
        })();
    const nextButtonDisabled = maxDate && maxDate < nextActiveStartDate;
    const next2ButtonDisabled = shouldShowPrevNext2Buttons && maxDate && maxDate < nextActiveStartDate2;
    function onClickPrevious() {
        setActiveStartDate(previousActiveStartDate, 'prev');
    }
    function onClickPrevious2() {
        setActiveStartDate(previousActiveStartDate2, 'prev2');
    }
    function onClickNext() {
        setActiveStartDate(nextActiveStartDate, 'next');
    }
    function onClickNext2() {
        setActiveStartDate(nextActiveStartDate2, 'next2');
    }
    function renderLabel(date) {
        const label = (() => {
            switch (view) {
                case 'century':
                    return getCenturyLabel(locale, formatYear, date);
                case 'decade':
                    return getDecadeLabel(locale, formatYear, date);
                case 'year':
                    return formatYear(locale, date);
                case 'month':
                    return formatMonthYear(locale, date);
                default:
                    throw new Error(`Invalid view: ${view}.`);
            }
        })();
        return navigationLabel
            ? navigationLabel({
                date,
                label,
                locale: locale || getUserLocale() || undefined,
                view,
            })
            : label;
    }
    function renderButton() {
        const labelClassName = `${className}__label`;
        return (_jsxs("button", { "aria-label": navigationAriaLabel, "aria-live": navigationAriaLive, className: labelClassName, disabled: !drillUpAvailable, onClick: drillUp, style: { flexGrow: 1 }, type: "button", children: [_jsx("span", { className: `${labelClassName}__labelText ${labelClassName}__labelText--from`, children: renderLabel(activeStartDate) }), showDoubleView ? (_jsxs(_Fragment, { children: [_jsx("span", { className: `${labelClassName}__divider`, children: " \u2013 " }), _jsx("span", { className: `${labelClassName}__labelText ${labelClassName}__labelText--to`, children: renderLabel(nextActiveStartDate) })] })) : null] }));
    }
    return (_jsxs("div", { className: className, children: [prev2Label !== null && shouldShowPrevNext2Buttons ? (_jsx("button", { "aria-label": prev2AriaLabel, className: `${className}__arrow ${className}__prev2-button`, disabled: prev2ButtonDisabled, onClick: onClickPrevious2, type: "button", children: prev2Label })) : null, prevLabel !== null && (_jsx("button", { "aria-label": prevAriaLabel, className: `${className}__arrow ${className}__prev-button`, disabled: prevButtonDisabled, onClick: onClickPrevious, type: "button", children: prevLabel })), renderButton(), nextLabel !== null && (_jsx("button", { "aria-label": nextAriaLabel, className: `${className}__arrow ${className}__next-button`, disabled: nextButtonDisabled, onClick: onClickNext, type: "button", children: nextLabel })), next2Label !== null && shouldShowPrevNext2Buttons ? (_jsx("button", { "aria-label": next2AriaLabel, className: `${className}__arrow ${className}__next2-button`, disabled: next2ButtonDisabled, onClick: onClickNext2, type: "button", children: next2Label })) : null] }));
}
