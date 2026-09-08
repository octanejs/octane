import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Day from '../../src/MonthView/Day.tsrx';

afterEach(cleanup);

const tileProps = {
	activeStartDate: new Date(2018, 0, 1),
	calendarType: 'iso8601' as const,
	classes: ['react-calendar__tile'],
	currentMonthIndex: 0,
	date: new Date(2018, 0, 1),
	locale: 'en-US',
};

describe('Day', () => {
	// Per upstream/canonical/src/MonthView/Day.spec.tsx:16.
	it('applies given classNames properly', () => {
		const { container } = render(Day, {
			props: {
				...tileProps,
				classes: ['react-calendar__tile', 'react-calendar__tile--flag'],
				tileClassName: () => 'testFunctionClassName',
			},
		});
		const wrapper = container.querySelector('.react-calendar__tile') as HTMLButtonElement;

		expect(wrapper.classList.contains('react-calendar__tile')).toBe(true);
		expect(wrapper.classList.contains('react-calendar__tile--flag')).toBe(true);
		expect(wrapper.classList.contains('react-calendar__month-view__days__day')).toBe(true);
		expect(wrapper.classList.contains('testFunctionClassName')).toBe(true);
	});

	// Per upstream/canonical/src/MonthView/Day.spec.tsx:33.
	it('applies additional classNames for weekends', () => {
		const { container } = render(Day, {
			props: { ...tileProps, date: new Date(2018, 0, 6) },
		});

		expect(
			container
				.querySelector('.react-calendar__tile')
				?.classList.contains('react-calendar__month-view__days__day--weekend'),
		).toBe(true);
	});

	// Per upstream/canonical/src/MonthView/Day.spec.tsx:46.
	it('applies additional classNames for neighboring months', () => {
		const { container } = render(Day, {
			props: { ...tileProps, date: new Date(2018, 1, 2) },
		});

		expect(
			container
				.querySelector('.react-calendar__tile')
				?.classList.contains('react-calendar__month-view__days__day--neighboringMonth'),
		).toBe(true);
	});

	// Per upstream/canonical/src/MonthView/Day.spec.tsx:54.
	it('renders component with proper abbreviation', () => {
		const { container } = render(Day, { props: tileProps });
		const abbr = container.querySelector('abbr');

		expect(abbr?.getAttribute('aria-label')).toBe('January 1, 2018');
		expect(container.textContent).toContain('1');
	});

	// Per upstream/canonical/src/MonthView/Day.spec.tsx:64.
	it("is disabled when date is before beginning of minDate's day", () => {
		const { container } = render(Day, {
			props: { ...tileProps, minDate: new Date(2018, 0, 2) },
		});

		expect((container.querySelector('.react-calendar__tile') as HTMLButtonElement).disabled).toBe(
			true,
		);
	});

	// Per upstream/canonical/src/MonthView/Day.spec.tsx:104.
	it('calls onClick callback when clicked and sends proper date as an argument', () => {
		const date = new Date(2018, 0, 1);
		const onClick = vi.fn();
		const { container } = render(Day, { props: { ...tileProps, date, onClick } });

		fireEvent.click(container.querySelector('.react-calendar__tile') as HTMLButtonElement);

		expect(onClick).toHaveBeenCalledWith(date, expect.any(MouseEvent));
	});

	// Per upstream/canonical/src/MonthView/Day.spec.tsx:116.
	it('calls onMouseOver callback when hovered and sends proper date as an argument', () => {
		const date = new Date(2018, 0, 1);
		const onMouseOver = vi.fn();
		const { container } = render(Day, { props: { ...tileProps, date, onMouseOver } });

		fireEvent.mouseOver(container.querySelector('.react-calendar__tile') as HTMLButtonElement);

		expect(onMouseOver).toHaveBeenCalledWith(date);
	});
});
