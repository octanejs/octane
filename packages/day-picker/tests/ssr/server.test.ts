import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';
import { ServerCalendarFixture } from '../_fixtures/calendar.tsrx';

describe('react-day-picker v10.0.1 server rendering', () => {
	// @parity-case ssr:calendar-grid
	it('renders the calendar grid without browser globals', () => {
		const html = renderToString(ServerCalendarFixture).html;
		expect(html).toContain('role="grid"');
		expect(html).toContain('August 2026');
	});
});
