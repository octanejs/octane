import type { DateLib } from '../classes/DateLib.js';
import { CalendarDay } from '../classes/index.js';
import type { DayPickerProps, MoveFocusBy, MoveFocusDir } from '../types/index.js';
import { dateMatchModifiers } from '../utils/dateMatchModifiers.js';
import { getFocusableDate } from './getFocusableDate.js';

export function getNextFocus(
	moveBy: MoveFocusBy,
	moveDir: MoveFocusDir,
	refDay: CalendarDay,
	calendarStartMonth: Date | undefined,
	calendarEndMonth: Date | undefined,
	props: Pick<DayPickerProps, 'disabled' | 'hidden' | 'modifiers' | 'ISOWeek' | 'timeZone'>,
	dateLib: DateLib,
	attempt = 0,
): CalendarDay | undefined {
	if (attempt > 365) return undefined;
	const focusableDate = getFocusableDate(
		moveBy,
		moveDir,
		refDay.date,
		calendarStartMonth,
		calendarEndMonth,
		props,
		dateLib,
	);
	const isDisabled = Boolean(
		props.disabled && dateMatchModifiers(focusableDate, props.disabled, dateLib),
	);
	const isHidden = Boolean(
		props.hidden && dateMatchModifiers(focusableDate, props.hidden, dateLib),
	);
	const focusDay = new CalendarDay(focusableDate, focusableDate, dateLib);
	if (!isDisabled && !isHidden) return focusDay;
	return getNextFocus(
		moveBy,
		moveDir,
		focusDay,
		calendarStartMonth,
		calendarEndMonth,
		props,
		dateLib,
		attempt + 1,
	);
}
