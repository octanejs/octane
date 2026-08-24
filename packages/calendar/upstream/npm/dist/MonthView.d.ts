import Days from './MonthView/Days.js';
import Weekdays from './MonthView/Weekdays.js';
import WeekNumbers from './MonthView/WeekNumbers.js';
import type { CalendarType } from './shared/types.js';
type MonthViewProps = {
    /**
     * Type of calendar that should be used. Can be `'gregory`, `'hebrew'`, `'islamic'`, `'iso8601'`. Setting to `"gregory"` or `"hebrew"` will change the first day of the week to Sunday. Setting to `"islamic"` will change the first day of the week to Saturday. Setting to `"islamic"` or `"hebrew"` will make weekends appear on Friday to Saturday.
     *
     * @example 'iso8601'
     */
    calendarType?: CalendarType;
    /**
     *  Whether week numbers shall be shown at the left of MonthView or not.
     *
     * @default false
     * @example true
     */
    showWeekNumbers?: boolean;
} & Omit<React.ComponentProps<typeof Weekdays> & React.ComponentProps<typeof WeekNumbers> & React.ComponentProps<typeof Days>, 'calendarType'>;
/**
 * Displays a given month.
 */
export default function MonthView(props: MonthViewProps): React.ReactElement;
export {};
