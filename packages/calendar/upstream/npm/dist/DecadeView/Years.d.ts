import TileGroup from '../TileGroup.js';
import Year from './Year.js';
type YearsProps = {
    /**
     * The beginning of a period that shall be displayed.
     *
     * @example new Date(2017, 0, 1)
     */
    activeStartDate: Date;
    /**
     * Whether years from next decade shall be rendered to fill the entire last row in.
     *
     * @default false
     * @example true
     */
    showNeighboringDecade?: boolean;
} & Omit<React.ComponentProps<typeof TileGroup>, 'dateTransform' | 'dateType' | 'end' | 'renderTile' | 'start'> & Omit<React.ComponentProps<typeof Year>, 'classes' | 'currentDecade' | 'date'>;
export default function Years(props: YearsProps): React.ReactElement;
export {};
