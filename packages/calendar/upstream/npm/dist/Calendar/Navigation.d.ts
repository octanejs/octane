import { formatMonthYear as defaultFormatMonthYear, formatYear as defaultFormatYear } from '../shared/dateFormatter.js';
import type { Action, NavigationLabelFunc, RangeType } from '../shared/types.js';
type NavigationProps = {
    /**
     * The beginning of a period that shall be displayed. If you wish to use react-calendar in an uncontrolled way, use `defaultActiveStartDate` instead.
     *
     * @example new Date(2017, 0, 1)
     */
    activeStartDate: Date;
    drillUp: () => void;
    /**
     * Function called to override default formatting of months and years. Can be used to use your own formatting function.
     *
     * @example (locale, date) => formatDate(date, 'MMMM YYYY')
     */
    formatMonthYear?: typeof defaultFormatMonthYear;
    /**
     *  Function called to override default formatting of year in the top navigation section. Can be used to use your own formatting function.
     *
     * @example (locale, date) => formatDate(date, 'YYYY')
     */
    formatYear?: typeof defaultFormatYear;
    /**
     * Locale that should be used by the calendar. Can be any [IETF language tag](https://en.wikipedia.org/wiki/IETF_language_tag).
     *
     * **Note**: When using SSR, setting this prop may help resolving hydration errors caused by locale mismatch between server and client.
     *
     * @example 'hu-HU'
     */
    locale?: string;
    /**
     * Maximum date that the user can select. Periods partially overlapped by maxDate will also be selectable, although react-calendar will ensure that no later date is selected.
     *
     * @example new Date()
     */
    maxDate?: Date;
    /**
     * Minimum date that the user can select. Periods partially overlapped by minDate will also be selectable, although react-calendar will ensure that no earlier date is selected.
     *
     * @example new Date()
     */
    minDate?: Date;
    /**
     * `aria-label` attribute of a label rendered on calendar navigation bar.
     *
     * @example 'Go up'
     */
    navigationAriaLabel?: string;
    /**
     * `aria-live` attribute of a label rendered on calendar navigation bar.
     *
     * @default undefined
     * @example 'polite'
     */
    navigationAriaLive?: 'off' | 'polite' | 'assertive';
    /**
     * Content of a label rendered on calendar navigation bar.
     *
     * @example ({ date, label, locale, view }) => alert(`Current view: ${view}, date: ${date.toLocaleDateString(locale)}`)
     */
    navigationLabel?: NavigationLabelFunc;
    /**
     * `aria-label` attribute of the "next on higher level" button on the navigation pane.
     *
     * @example 'Jump forwards'
     */
    next2AriaLabel?: string;
    /**
     * Content of the "next on higher level" button on the navigation pane. Setting the value explicitly to null will hide the icon.
     *
     * @example '»'
     * @example <DoubleNextIcon />
     */
    next2Label?: React.ReactNode;
    /**
     * `aria-label` attribute of the "next" button on the navigation pane.
     *
     * @example 'Next'
     */
    nextAriaLabel?: string;
    /**
     * Content of the "next" button on the navigation pane. Setting the value explicitly to null will hide the icon.
     *
     * @example '›'
     * @example <NextIcon />
     */
    nextLabel?: React.ReactNode;
    /**
     * `aria-label` attribute of the "previous on higher level" button on the navigation pane.
     *
     * @example 'Jump backwards'
     */
    prev2AriaLabel?: string;
    /**
     * Content of the "previous on higher level" button on the navigation pane. Setting the value explicitly to null will hide the icon.
     *
     * @example '«'
     * @example <DoublePreviousIcon />
     */
    prev2Label?: React.ReactNode;
    /**
     * `aria-label` attribute of the "previous" button on the navigation pane.
     *
     * @example 'Previous'
     */
    prevAriaLabel?: string;
    /**
     * Content of the "previous" button on the navigation pane. Setting the value explicitly to null will hide the icon.
     *
     * @example '‹'
     * @example <PreviousIcon />
     */
    prevLabel?: React.ReactNode;
    setActiveStartDate: (nextActiveStartDate: Date, action: Action) => void;
    /**
     * Whether to show two months/years/… at a time instead of one. Defaults `showFixedNumberOfWeeks` prop to be `true`.
     *
     * @default false
     * @example true
     */
    showDoubleView?: boolean;
    /**
     * Determines which calendar view shall be opened. Does not disable navigation. Can be `"day"`, `"month"`, `"year"`, `"decade"` or `"century"`.
     *
     * @example 'year'
     */
    view: RangeType;
    views: string[];
};
export default function Navigation({ activeStartDate, drillUp, formatMonthYear, formatYear, locale, maxDate, minDate, navigationAriaLabel, navigationAriaLive, navigationLabel, next2AriaLabel, next2Label, nextAriaLabel, nextLabel, prev2AriaLabel, prev2Label, prevAriaLabel, prevLabel, setActiveStartDate, showDoubleView, view, views, }: NavigationProps): React.ReactElement;
export {};
