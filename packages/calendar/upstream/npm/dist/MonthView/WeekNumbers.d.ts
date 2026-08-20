import type { CalendarType, OnClickWeekNumberFunc } from '../shared/types.js';
type WeekNumbersProps = {
    /**
     * The beginning of a period that shall be displayed.
     *
     * @example new Date(2017, 0, 1)
     */
    activeStartDate: Date;
    /**
     * Type of calendar that should be used. Can be `'gregory`, `'hebrew'`, `'islamic'`, `'iso8601'`. Setting to `"gregory"` or `"hebrew"` will change the first day of the week to Sunday. Setting to `"islamic"` will change the first day of the week to Saturday. Setting to `"islamic"` or `"hebrew"` will make weekends appear on Friday to Saturday.
     *
     * @example 'iso8601'
     */
    calendarType: CalendarType | undefined;
    /**
     * Function called when the user clicks a week number.
     *
     * @example (weekNumber, date, event) => alert('Clicked week: ', weekNumber, 'that starts on: ', date)
     */
    onClickWeekNumber?: OnClickWeekNumberFunc;
    onMouseLeave?: () => void;
    /**
     * Whether to always show fixed number of weeks (6). Forces `showNeighboringMonth` prop to be `true`.
     *
     * @default false
     * @example true
     */
    showFixedNumberOfWeeks?: boolean;
};
export default function WeekNumbers(props: WeekNumbersProps): React.ReactElement;
export {};
