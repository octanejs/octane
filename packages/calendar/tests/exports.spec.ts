import { describe, expect, it } from 'vitest';

import Calendar, {
	Calendar as NamedCalendar,
	CenturyView,
	DecadeView,
	MonthView,
	Navigation,
	YearView,
} from '@octanejs/calendar';

describe('@octanejs/calendar exports', () => {
	it('matches the react-calendar 6.0.1 runtime root surface', () => {
		expect(Calendar).toBe(NamedCalendar);
		expect(CenturyView).toBeTypeOf('function');
		expect(DecadeView).toBeTypeOf('function');
		expect(MonthView).toBeTypeOf('function');
		expect(Navigation).toBeTypeOf('function');
		expect(YearView).toBeTypeOf('function');
	});
});
