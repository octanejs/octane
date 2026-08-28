import Tile from '../Tile.js';
import { formatYear as defaultFormatYear } from '../shared/dateFormatter.js';
type DecadeProps = {
    classes?: string[];
    currentCentury: number;
    /**
     *  Function called to override default formatting of year in the top navigation section. Can be used to use your own formatting function.
     *
     * @example (locale, date) => formatDate(date, 'YYYY')
     */
    formatYear?: typeof defaultFormatYear;
} & Omit<React.ComponentProps<typeof Tile>, 'children' | 'maxDateTransform' | 'minDateTransform' | 'view'>;
export default function Decade({ classes, currentCentury, formatYear, ...otherProps }: DecadeProps): React.ReactElement;
export {};
