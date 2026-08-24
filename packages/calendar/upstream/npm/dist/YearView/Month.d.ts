import Tile from '../Tile.js';
import { formatMonth as defaultFormatMonth, formatMonthYear as defaultFormatMonthYear } from '../shared/dateFormatter.js';
type MonthProps = {
    classes?: string[];
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
} & Omit<React.ComponentProps<typeof Tile>, 'children' | 'formatAbbr' | 'maxDateTransform' | 'minDateTransform' | 'view'>;
export default function Month({ classes, formatMonth, formatMonthYear, ...otherProps }: MonthProps): React.ReactElement;
export {};
