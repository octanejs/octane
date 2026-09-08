import { type OctaneNode } from 'octane';
import clsx from 'clsx';

type ComponentProps<T extends (...args: any) => any> =
	T extends (props: infer P, ...rest: any) => any ? P : never;

import Days from './MonthView/Days.tsrx';
import Weekdays from './MonthView/Weekdays.tsrx';
import WeekNumbers from './MonthView/WeekNumbers.tsrx';

import { CALENDAR_TYPE_LOCALES, CALENDAR_TYPES } from './shared/const.js';

import type { CalendarType } from './shared/types.js';

function getCalendarTypeFromLocale(locale: string | undefined): CalendarType {
	if (locale) {
		for (const [calendarType, locales] of Object.entries(CALENDAR_TYPE_LOCALES)) {
			if (locales.includes(locale)) {
				return calendarType as CalendarType;
			}
		}
	}

	return CALENDAR_TYPES.ISO_8601;
}

type MonthViewProps =
	{
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
	} & Omit<
		ComponentProps<typeof Weekdays> & ComponentProps<typeof WeekNumbers> & ComponentProps<
			typeof Days
		>,
		'calendarType'
	>;

/**
 * Displays a given month.
 */
export default function MonthView(props: MonthViewProps): OctaneNode {
	const { activeStartDate, locale, onMouseLeave, showFixedNumberOfWeeks } = props;
	const {
		calendarType = getCalendarTypeFromLocale(locale),
		formatShortWeekday,
		formatWeekday,
		onClickWeekNumber,
		showWeekNumbers,
		...childProps
	} = props;

	function renderWeekdays() {
		return <Weekdays
			calendarType={calendarType}
			formatShortWeekday={formatShortWeekday}
			formatWeekday={formatWeekday}
			locale={locale}
			onMouseLeave={onMouseLeave}
		/>;
	}

	function renderWeekNumbers() {
		if (!showWeekNumbers) {
			return null;
		}

		return <WeekNumbers
			activeStartDate={activeStartDate}
			calendarType={calendarType}
			onClickWeekNumber={onClickWeekNumber}
			onMouseLeave={onMouseLeave}
			showFixedNumberOfWeeks={showFixedNumberOfWeeks}
		/>;
	}

	function renderDays() {
		return <Days calendarType={calendarType} {...childProps} />;
	}

	const className = 'react-calendar__month-view';

	return <div className={clsx(className, showWeekNumbers ? `${className}--weekNumbers` : '')}>
		<div
			style={{
				display: 'flex',
				alignItems: 'flex-end',
			}}
		>
			{renderWeekNumbers()}
			<div
				style={{
					flexGrow: 1,
					width: '100%',
				}}
			>
				{renderWeekdays()}
				{renderDays()}
			</div>
		</div>
	</div>;
}
