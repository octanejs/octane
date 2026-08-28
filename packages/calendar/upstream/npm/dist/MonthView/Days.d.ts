import TileGroup from '../TileGroup.js';
import Day from './Day.js';
import type { CalendarType } from '../shared/types.js';
type DaysProps = {
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
     * Whether to always show fixed number of weeks (6). Forces `showNeighboringMonth` prop to be `true`.
     *
     * @default false
     * @example true
     */
    showFixedNumberOfWeeks?: boolean;
    /**
     * Whether days from previous or next month shall be rendered if the month doesn't start on the first day of the week or doesn't end on the last day of the week, respectively.
     *
     * @default true
     * @example false
     */
    showNeighboringMonth?: boolean;
} & Omit<React.ComponentProps<typeof TileGroup>, 'dateTransform' | 'dateType' | 'end' | 'renderTile' | 'start'> & Omit<React.ComponentProps<typeof Day>, 'classes' | 'currentMonthIndex' | 'date' | 'point'>;
export default function Days(props: DaysProps): React.ReactElement;
export {};
