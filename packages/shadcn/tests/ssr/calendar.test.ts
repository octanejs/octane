import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import {
	CalendarDropdownFixture,
	CalendarRangeFixture,
	CalendarSingleFixture,
	CalendarWeekNumberFixture,
	RadixCalendarFixture,
} from '../_fixtures/calendar-app.tsrx';

// The project runs on `environment: 'node'`, so reaching for a browser global
// during render is a crash here rather than a silent client-only dependency.
const FIXTURES: Array<[string, () => unknown, string[]]> = [
	[
		'Calendar (Base UI base)',
		CalendarSingleFixture,
		[
			'data-slot="calendar"',
			'[--cell-size:--spacing(7)]',
			'aria-label="January 2024"',
			'data-day="2024-01-15"',
			'lucide-chevron-left',
			'cn-rtl-flip',
		],
	],
	[
		'Calendar range',
		CalendarRangeFixture,
		['data-range-start="true"', 'data-range-middle="true"', 'data-range-end="true"'],
	],
	['Calendar dropdown caption', CalendarDropdownFixture, ['rdp-months_dropdown', '>Jan<']],
	['Calendar week numbers', CalendarWeekNumberFixture, ['rdp-week_number', 'size-(--cell-size)']],
	['Calendar (Radix base)', RadixCalendarFixture, ['data-slot="calendar"', 'rdp-month_grid']],
];

describe('@octanejs/shadcn — server rendering (Calendar)', () => {
	for (const [name, fixture, markers] of FIXTURES) {
		it(`${name} renders on the server with its contract markers`, () => {
			const { html } = renderToString(fixture as never);
			for (const marker of markers) {
				expect(html).toContain(marker);
			}
		});
	}
});
