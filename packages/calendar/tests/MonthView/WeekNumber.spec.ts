import { cleanup, render } from '@octanejs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import WeekNumber from '../../src/MonthView/WeekNumber.tsrx';

afterEach(cleanup);

const defaultProps = {
	date: new Date(2019, 0, 1),
	weekNumber: 1,
};

describe('<WeekNumber /> component', () => {
	// Per upstream/canonical/src/MonthView/WeekNumber.spec.tsx:12.
	it('renders div by default', () => {
		const { container } = render(WeekNumber, { props: defaultProps });

		expect(container.querySelector('div')).not.toBeNull();
	});

	// Per upstream/canonical/src/MonthView/WeekNumber.spec.tsx:18.
	it('renders button given onClickWeekNumber prop', () => {
		const { container } = render(WeekNumber, {
			props: { ...defaultProps, onClickWeekNumber: () => {} },
		});

		expect(container.querySelector('button')).not.toBeNull();
	});

	// Per upstream/canonical/src/MonthView/WeekNumber.spec.tsx:30.
	it('renders weekNumber properly', () => {
		const weekNumber = 42;
		const { container } = render(WeekNumber, {
			props: { ...defaultProps, weekNumber },
		});

		expect(container.textContent).toContain(String(weekNumber));
	});
});
