import TileGroup from '../TileGroup.js';
import Month from './Month.js';
type MonthsProps = {
    /**
     * The beginning of a period that shall be displayed.
     *
     * @example new Date(2017, 0, 1)
     */
    activeStartDate: Date;
} & Omit<React.ComponentProps<typeof TileGroup>, 'dateTransform' | 'dateType' | 'end' | 'renderTile' | 'start'> & Omit<React.ComponentProps<typeof Month>, 'classes' | 'date'>;
export default function Months(props: MonthsProps): React.ReactElement;
export {};
