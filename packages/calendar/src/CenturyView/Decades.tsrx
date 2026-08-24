import { type OctaneNode } from 'octane';
import { getDecadeStart } from '@wojtekmaj/date-utils';

type ComponentProps<T extends (...args: any) => any> =
	T extends (props: infer P, ...rest: any) => any ? P : never;

import TileGroup from '../TileGroup.tsrx';
import Decade from './Decade.tsrx';

import { getBeginOfCenturyYear } from '../shared/dates.js';

type DecadesProps =
	{
		/**
 * The beginning of a period that shall be displayed.
 *
 * @example new Date(2017, 0, 1)
 */
		activeStartDate: Date;
		/**
 * Whether decades from next century shall be rendered to fill the entire last row in.
 *
 * @default false
 * @example true
 */
		showNeighboringCentury?: boolean;
	} & Omit<
		ComponentProps<typeof TileGroup>,
		'dateTransform' | 'dateType' | 'end' | 'renderTile' | 'start'
	> & Omit<ComponentProps<typeof Decade>, 'classes' | 'currentCentury' | 'date'>;

export default function Decades(props: DecadesProps): OctaneNode {
	const { activeStartDate, hover, showNeighboringCentury, value, valueType, ...otherProps } = props;
	const start = getBeginOfCenturyYear(activeStartDate);
	const end = start + (showNeighboringCentury ? 119 : 99);

	return <TileGroup
		className="react-calendar__century-view__decades"
		dateTransform={getDecadeStart}
		dateType="decade"
		end={end}
		hover={hover}
		renderTile={({ date, ...otherTileProps }) =>
			<Decade
				key={date.getTime()}
				{...otherProps}
				{...otherTileProps}
				activeStartDate={activeStartDate}
				currentCentury={start}
				date={date}
			/>}
		start={start}
		step={10}
		value={value}
		valueType={valueType}
	/>;
}
