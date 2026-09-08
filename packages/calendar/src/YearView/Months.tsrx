import { type OctaneNode } from 'octane';
import { getMonthStart, getYear } from '@wojtekmaj/date-utils';

type ComponentProps<T extends (...args: any) => any> =
	T extends (props: infer P, ...rest: any) => any ? P : never;

import TileGroup from '../TileGroup.tsrx';
import Month from './Month.tsrx';

type MonthsProps =
	{
		/**
 * The beginning of a period that shall be displayed.
 *
 * @example new Date(2017, 0, 1)
 */
		activeStartDate: Date;
	} & Omit<
		ComponentProps<typeof TileGroup>,
		'dateTransform' | 'dateType' | 'end' | 'renderTile' | 'start'
	> & Omit<ComponentProps<typeof Month>, 'classes' | 'date'>;

export default function Months(props: MonthsProps): OctaneNode {
	const { activeStartDate, hover, value, valueType, ...otherProps } = props;
	const start = 0;
	const end = 11;
	const year = getYear(activeStartDate);

	return <TileGroup
		className="react-calendar__year-view__months"
		dateTransform={(monthIndex) => {
			const date = new Date();
			date.setFullYear(year, monthIndex, 1);
			return getMonthStart(date);
		}}
		dateType="month"
		end={end}
		hover={hover}
		renderTile={({ date, ...otherTileProps }) =>
			<Month
				key={date.getTime()}
				{...otherProps}
				{...otherTileProps}
				activeStartDate={activeStartDate}
				date={date}
			/>}
		start={start}
		value={value}
		valueType={valueType}
	/>;
}
