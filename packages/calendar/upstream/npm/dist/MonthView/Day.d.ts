import Tile from '../Tile.js';
import { formatDay as defaultFormatDay, formatLongDate as defaultFormatLongDate } from '../shared/dateFormatter.js';
import type { CalendarType } from '../shared/types.js';
type DayProps = {
    /**
     * Type of calendar that should be used. Can be `'gregory`, `'hebrew'`, `'islamic'`, `'iso8601'`. Setting to `"gregory"` or `"hebrew"` will change the first day of the week to Sunday. Setting to `"islamic"` will change the first day of the week to Saturday. Setting to `"islamic"` or `"hebrew"` will make weekends appear on Friday to Saturday.
     *
     * @example 'iso8601'
     */
    calendarType: CalendarType | undefined;
    classes?: string[];
    currentMonthIndex: number;
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
} & Omit<React.ComponentProps<typeof Tile>, 'children' | 'formatAbbr' | 'maxDateTransform' | 'minDateTransform' | 'view'>;
export default function Day({ calendarType, classes, currentMonthIndex, formatDay, formatLongDate, ...otherProps }: DayProps): React.ReactElement;
export {};
