import type { formatDay as defaultFormatDay, formatLongDate as defaultFormatLongDate, formatMonth as defaultFormatMonth, formatMonthYear as defaultFormatMonthYear, formatShortWeekday as defaultFormatShortWeekday, formatWeekday as defaultFormatWeekday, formatYear as defaultFormatYear } from './shared/dateFormatter.js';
import type { CalendarType, ClassName, Detail, LooseValue, NavigationLabelFunc, OnArgs, OnClickFunc, OnClickWeekNumberFunc, TileClassNameFunc, TileContentFunc, TileDisabledFunc, Value, View } from './shared/types.js';
export type CalendarProps = {
    /**
     * The beginning of a period that shall be displayed. If you wish to use react-calendar in an uncontrolled way, use `defaultActiveStartDate` instead.
     *
     * @example new Date(2017, 0, 1)
     */
    activeStartDate?: Date;
    /**
     * Whether to call onChange with only partial result given `selectRange` prop.
     *
     * @default false
     * @example true
     */
    allowPartialRange?: boolean;
    /**
     * Type of calendar that should be used. Can be `'gregory`, `'hebrew'`, `'islamic'`, `'iso8601'`. Setting to `"gregory"` or `"hebrew"` will change the first day of the week to Sunday. Setting to `"islamic"` will change the first day of the week to Saturday. Setting to `"islamic"` or `"hebrew"` will make weekends appear on Friday to Saturday.
     *
     * @example 'iso8601'
     */
    calendarType?: CalendarType;
    /**
     * Class name(s) that will be added along with `"react-calendar"` to the main react-calendar `<div>` element.
     *
     * @example 'class1 class2'
     * @example ['class1', 'class2 class3']
     */
    className?: ClassName;
    /**
     * The test ID used for testing purposes.
     *
     * @example 'clock'
     */
    'data-testid'?: string;
    /**
     * The beginning of a period that shall be displayed by default. If you wish to use react-calendar in a controlled way, use `activeStartDate` instead.
     *
     * @example new Date(2017, 0, 1)
     */
    defaultActiveStartDate?: Date;
    /**
     * Calendar value that shall be selected initially. Can be either one value or an array of two values. If you wish to use react-calendar in a controlled way, use `value` instead.
     *
     * @example new Date(2017, 0, 1)
     * @example [new Date(2017, 0, 1), new Date(2017, 7, 1)]
     */
    defaultValue?: LooseValue;
    /**
     * Determines which calendar view shall be opened initially. Does not disable navigation. Can be `"month"`, `"year"`, `"decade"` or `"century"`. If you wish to use react-calendar in a controlled way, use `view` instead.
     *
     * @example 'year'
     */
    defaultView?: View;
    /**
     * Function called to override default formatting of day tile labels. Can be used to use your own formatting function.
     *
     * @example (locale, date) => formatDate(date, 'd')
     */
    formatDay?: typeof defaultFormatDay;
    /**
     * Function called to override default formatting of day tile `abbr` labels. Can be used to use your own formatting function.
     *
     * @example (locale, date) => formatDate(date, 'dd MMM YYYY')
     */
    formatLongDate?: typeof defaultFormatLongDate;
    /**
     * Function called to override default formatting of month names. Can be used to use your own formatting function.
     *
     * @example (locale, date) => formatDate(date, 'MMM')
     */
    formatMonth?: typeof defaultFormatMonth;
    /**
     * Function called to override default formatting of months and years. Can be used to use your own formatting function.
     *
     * @example (locale, date) => formatDate(date, 'MMMM YYYY')
     */
    formatMonthYear?: typeof defaultFormatMonthYear;
    /**
     * Function called to override default formatting of weekday names (shortened). Can be used to use your own formatting function.
     *
     * @example (locale, date) => formatDate(date, 'dd')
     */
    formatShortWeekday?: typeof defaultFormatShortWeekday;
    /**
     * Function called to override default formatting of weekday names. Can be used to use your own formatting function.
     *
     * @example (locale, date) => formatDate(date, 'dd')
     */
    formatWeekday?: typeof defaultFormatWeekday;
    /**
     *  Function called to override default formatting of year in the top navigation section. Can be used to use your own formatting function.
     *
     * @example (locale, date) => formatDate(date, 'YYYY')
     */
    formatYear?: typeof defaultFormatYear;
    /**
     * Whether to go to the beginning of the range when selecting the end of the range.
     *
     * @default true
     * @example false
     */
    goToRangeStartOnSelect?: boolean;
    /**
     *  A prop that behaves like [ref](https://reactjs.org/docs/refs-and-the-dom.html), but it's passed to main `<div>` rendered by `<Calendar>` component.
     *
     * @example (ref) => { this.myCalendar = ref; }
     * @example this.ref
     * @example ref
     */
    inputRef?: React.Ref<HTMLDivElement>;
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
     * The most detailed view that the user shall see. View defined here also becomes the one on which clicking an item will select a date and pass it to onChange. Can be `"month"`, `"year"`, `"decade"` or `"century"`.
     *
     * @default 'month'
     * @example 'year'
     */
    maxDetail?: Detail;
    /**
     * Minimum date that the user can select. Periods partially overlapped by minDate will also be selectable, although react-calendar will ensure that no earlier date is selected.
     *
     * @example new Date()
     */
    minDate?: Date;
    /**
     * The least detailed view that the user shall see. Can be `"month"`, `"year"`, `"decade"` or `"century"`.
     *
     * @default 'century'
     * @example 'decade'
     */
    minDetail?: Detail;
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
     * Function called when the user navigates from one view to another using previous/next button. Note that this function will not be called when e.g. drilling up from January 2021 to 2021 or drilling down the other way around.
     *
     * `action` signifies the reason for active start date change and can be one of the following values: `"prev"`, `"prev2"`, `"next"`, `"next2"`, `"drillUp"`, `"drillDown"`, `"onChange"`.
     *
     * @example ({ action, activeStartDate, value, view }) => alert('Changed view to: ', activeStartDate, view)
     */
    onActiveStartDateChange?: ({ action, activeStartDate, value, view }: OnArgs) => void;
    /**
     * Function called when the user clicks an item (day on month view, month on year view and so on) on the most detailed view available.
     *
     * @example (value, event) => alert('New date is: ', value)
     */
    onChange?: (value: Value, event: React.MouseEvent<HTMLButtonElement>) => void;
    /**
     * Function called when the user clicks a day.
     *
     * @example (value, event) => alert('Clicked day: ', value)
     */
    onClickDay?: OnClickFunc;
    /**
     * Function called when the user clicks a decade.
     *
     * @example (value, event) => alert('Clicked decade: ', value)
     */
    onClickDecade?: OnClickFunc;
    /**
     * Function called when the user clicks a month.
     *
     * @example (value, event) => alert('Clicked month: ', value)
     */
    onClickMonth?: OnClickFunc;
    /**
     * Function called when the user clicks a week number.
     *
     * @example (weekNumber, date, event) => alert('Clicked week: ', weekNumber, 'that starts on: ', date)
     */
    onClickWeekNumber?: OnClickWeekNumberFunc;
    /**
     * Function called when the user clicks a year.
     *
     * @example (value, event) => alert('Clicked year: ', value)
     */
    onClickYear?: OnClickFunc;
    /**
     * Function called when the user drills down by clicking a tile.
     *
     * @example ({ activeStartDate, view }) => alert('Drilled down to: ', activeStartDate, view)
     */
    onDrillDown?: ({ action, activeStartDate, value, view }: OnArgs) => void;
    /**
     * Function called when the user drills up by clicking drill up button.
     *
     * @example ({ activeStartDate, view }) => alert('Drilled up to: ', activeStartDate, view)
     */
    onDrillUp?: ({ action, activeStartDate, value, view }: OnArgs) => void;
    /**
     * Function called when the user navigates from one view to another using drill up button or by clicking a tile.
     *
     * `action` signifies the reason for view change and can be one of the following values: `"prev"`, `"prev2"`, `"next"`, `"next2"`, `"drillUp"`, `"drillDown"`, `"onChange"`.
     *
     * @example ({ action, activeStartDate, value, view }) => alert('New view is: ', view)
     */
    onViewChange?: ({ action, activeStartDate, value, view }: OnArgs) => void;
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
    /**
     * Which dates shall be passed by the calendar to the onChange function and onClick{Period} functions. Can be `"start"`, `"end"` or `"range"`. The latter will cause an array with start and end values to be passed.
     *
     * @default 'start'
     * @example 'range'
     */
    returnValue?: 'start' | 'end' | 'range';
    /**
     * Whether the user shall select two dates forming a range instead of just one. **Note**: This feature will make react-calendar return array with two dates regardless of returnValue setting.
     *
     * @default false
     * @example true
     */
    selectRange?: boolean;
    /**
     * Whether to show two months/years/… at a time instead of one. Defaults `showFixedNumberOfWeeks` prop to be `true`.
     *
     * @default false
     * @example true
     */
    showDoubleView?: boolean;
    /**
     * Whether to always show fixed number of weeks (6). Forces `showNeighboringMonth` prop to be `true`.
     *
     * @default false
     * @example true
     */
    showFixedNumberOfWeeks?: boolean;
    /**
     * Whether a navigation bar with arrows and title shall be rendered.
     *
     * @default true
     * @example false
     */
    showNavigation?: boolean;
    /**
     * Whether decades from next century shall be rendered to fill the entire last row in.
     *
     * @default false
     * @example true
     */
    showNeighboringCentury?: boolean;
    /**
     * Whether years from next decade shall be rendered to fill the entire last row in.
     *
     * @default false
     * @example true
     */
    showNeighboringDecade?: boolean;
    /**
     * Whether days from previous or next month shall be rendered if the month doesn't start on the first day of the week or doesn't end on the last day of the week, respectively.
     *
     * @default true
     * @example false
     */
    showNeighboringMonth?: boolean;
    /**
     *  Whether week numbers shall be shown at the left of MonthView or not.
     *
     * @default false
     * @example true
     */
    showWeekNumbers?: boolean;
    /**
     * Class name(s) that will be applied to a given calendar item (day on month view, month on year view and so on).
     *
     * @example 'class1 class2'
     * @example ['class1', 'class2 class3']
     * @example ({ activeStartDate, date, view }) => view === 'month' && date.getDay() === 3 ? 'wednesday' : null
     */
    tileClassName?: TileClassNameFunc | ClassName;
    /**
     * Allows to render custom content within a given calendar item (day on month view, month on year view and so on).
     *
     * @example 'Sample'
     * @example ({ activeStartDate, date, view }) => view === 'month' && date.getDay() === 0 ? <p>It's Sunday!</p> : null
     */
    tileContent?: TileContentFunc | React.ReactNode;
    /**
     * Pass a function to determine if a certain day should be displayed as disabled.
     *
     * @example ({ activeStartDate, date, view }) => date.getDay() === 0
     */
    tileDisabled?: TileDisabledFunc;
    /**
     * Calendar value. Can be either one value or an array of two values. If you wish to use react-calendar in an uncontrolled way, use `defaultValue` instead.
     *
     * @example new Date(2017, 0, 1)
     * @example [new Date(2017, 0, 1), new Date(2017, 7, 1)]
     * @example ['2017-01-01', '2017-08-01']
     */
    value?: LooseValue;
    /**
     * Determines which calendar view shall be opened. Does not disable navigation. Can be `"month"`, `"year"`, `"decade"` or `"century"`. If you wish to use react-calendar in an uncontrolled way, use `defaultView` instead.
     *
     * @example 'year'
     */
    view?: View;
};
declare const Calendar: React.ForwardRefExoticComponent<CalendarProps & React.RefAttributes<unknown>>;
export default Calendar;
