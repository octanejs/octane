import { type OctaneNode } from 'octane';
import { getMonthEnd, getMonthStart } from '@wojtekmaj/date-utils';

type ComponentProps<T extends (...args: any) => any> =
	T extends (props: infer P, ...rest: any) => any ? P : never;

import Tile from '../Tile.tsrx';

import {
	formatMonth as defaultFormatMonth,
	formatMonthYear as defaultFormatMonthYear,
} from '../shared/dateFormatter.js';

const className = 'react-calendar__year-view__months__month';

type MonthProps =
	{
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
	} & Omit<
		ComponentProps<typeof Tile>,
		'children' | 'formatAbbr' | 'maxDateTransform' | 'minDateTransform' | 'view'
	>;

export default function Month({
	classes = [],
	formatMonth = defaultFormatMonth,
	formatMonthYear = defaultFormatMonthYear,
	...otherProps
}: MonthProps): OctaneNode {
	const { date, locale } = otherProps;

	return <Tile
		{...otherProps}
		classes={[...classes, className]}
		formatAbbr={formatMonthYear}
		maxDateTransform={getMonthEnd}
		minDateTransform={getMonthStart}
		view="year"
	>{formatMonth(locale, date)}</Tile>;
}
