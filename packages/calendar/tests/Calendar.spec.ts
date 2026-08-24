import { act, cleanup, render } from '@octanejs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import Calendar from '@octanejs/calendar';

type CalendarHandle = {
	activeStartDate: Date;
	drillDown: (nextActiveStartDate: Date, event: MouseEvent) => void;
	drillUp: () => void;
	onChange: (value: Date, event: MouseEvent) => void;
	setActiveStartDate: (
		nextActiveStartDate: Date,
		action: 'prev' | 'prev2' | 'next' | 'next2' | 'onChange' | 'drillUp' | 'drillDown',
	) => void;
	value: Date | [Date | null, Date | null] | null;
	view: 'century' | 'decade' | 'year' | 'month';
};

afterEach(cleanup);

describe('Calendar', () => {
	// Per upstream/canonical/src/Calendar.spec.tsx:35.
	it('applies className to its wrapper when given a string', () => {
		const className = 'testClassName';

		const { container } = render(Calendar, { props: { className, locale: 'en-US' } });

		expect(container.querySelector('.react-calendar')?.classList.contains(className)).toBe(true);
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:45.
	it('applies data-testid to its wrapper when given a string', () => {
		const dataTestId = 'testCalendar';

		const { container } = render(Calendar, {
			props: { 'data-testid': dataTestId, locale: 'en-US' },
		});

		expect(container.querySelector('.react-calendar')?.getAttribute('data-testid')).toBe(
			dataTestId,
		);
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:55.
	it('passes container element to inputRef properly', () => {
		const inputRef = { current: null as HTMLDivElement | null };

		render(Calendar, { props: { inputRef, locale: 'en-US' } });

		expect(inputRef.current).toBeInstanceOf(HTMLDivElement);
		expect(inputRef.current?.classList.contains('react-calendar')).toBe(true);
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:63.
	it('renders Navigation by default', () => {
		const { container } = render(Calendar, { props: { locale: 'en-US' } });

		expect(container.querySelector('.react-calendar__navigation')).not.toBeNull();
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:71.
	it('does not render Navigation when showNavigation flag is set to false', () => {
		const { container } = render(Calendar, {
			props: { locale: 'en-US', showNavigation: false },
		});

		expect(container.querySelector('.react-calendar__navigation')).toBeNull();
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:79.
	it('uses given value when passed value using value prop', () => {
		const instance = { current: null as CalendarHandle | null };
		const value = new Date(2019, 0, 1);

		render(Calendar, { props: { locale: 'en-US', ref: instance, value } });

		expect(instance.current?.value).toEqual(value);
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:91.
	it('uses given value when passed value using defaultValue prop', () => {
		const instance = { current: null as CalendarHandle | null };
		const defaultValue = new Date(2019, 0, 1);

		render(Calendar, { props: { defaultValue, locale: 'en-US', ref: instance } });

		expect(instance.current?.value).toEqual(defaultValue);
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:103.
	it('renders given view when passed view using view prop', () => {
		const instance = { current: null as CalendarHandle | null };

		render(Calendar, { props: { locale: 'en-US', ref: instance, view: 'century' } });

		expect(instance.current?.view).toBe('century');
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:115.
	it('renders given view when passed view using defaultView prop', () => {
		const instance = { current: null as CalendarHandle | null };

		render(Calendar, { props: { defaultView: 'century', locale: 'en-US', ref: instance } });

		expect(instance.current?.view).toBe('century');
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:168.
	it('changes activeStartDate when updating value via onChange', async () => {
		const instance = { current: null as CalendarHandle | null };
		const value = new Date(2018, 1, 15);
		const newValue = new Date(2018, 0, 15);

		render(Calendar, { props: { locale: 'en-US', ref: instance, value } });

		await act(() => {
			instance.current?.onChange(newValue, new MouseEvent('click', { bubbles: true }));
		});

		expect(instance.current?.activeStartDate).toEqual(new Date(2018, 0, 1));
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:127.
	it('renders given active start date when passed active start date using activeStartDate prop', () => {
		const instance = { current: null as CalendarHandle | null };

		render(Calendar, {
			props: { activeStartDate: new Date(2019, 0, 1), locale: 'en-US', ref: instance },
		});

		expect(instance.current?.activeStartDate).toEqual(new Date(2019, 0, 1));
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:139.
	it('renders given active start date when passed active start date using defaultActiveStartDate prop', () => {
		const instance = { current: null as CalendarHandle | null };

		render(Calendar, {
			props: { defaultActiveStartDate: new Date(2019, 0, 1), locale: 'en-US', ref: instance },
		});

		expect(instance.current?.activeStartDate).toEqual(new Date(2019, 0, 1));
	});

	describe('renders views properly', () => {
		// Per upstream/canonical/src/Calendar.spec.tsx:210.
		it('renders MonthView by default', () => {
			const { container } = render(Calendar, { props: { locale: 'en-US' } });

			expect(container.querySelector('.react-calendar__month-view')).not.toBeNull();
		});

		// Per upstream/canonical/src/Calendar.spec.tsx:218.
		it('renders MonthView when given view = "month"', () => {
			const { container } = render(Calendar, { props: { locale: 'en-US', view: 'month' } });

			expect(container.querySelector('.react-calendar__month-view')).not.toBeNull();
		});

		// Per upstream/canonical/src/Calendar.spec.tsx:226.
		it('renders YearView when given view = "year"', () => {
			const { container } = render(Calendar, { props: { locale: 'en-US', view: 'year' } });

			expect(container.querySelector('.react-calendar__year-view')).not.toBeNull();
		});

		// Per upstream/canonical/src/Calendar.spec.tsx:234.
		it('renders DecadeView when given view = "decade"', () => {
			const { container } = render(Calendar, { props: { locale: 'en-US', view: 'decade' } });

			expect(container.querySelector('.react-calendar__decade-view')).not.toBeNull();
		});

		// Per upstream/canonical/src/Calendar.spec.tsx:242.
		it('renders CenturyView when given view = "century"', () => {
			const { container } = render(Calendar, { props: { locale: 'en-US', view: 'century' } });

			expect(container.querySelector('.react-calendar__century-view')).not.toBeNull();
		});
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:287.
	it('does not render WeekNumbers component by default', () => {
		const { container } = render(Calendar, { props: { locale: 'en-US' } });

		expect(container.querySelector('.react-calendar__month-view__weekNumbers')).toBeNull();
	});

	// Per upstream/canonical/src/Calendar.spec.tsx:295.
	it('renders WeekNumbers component given showWeekNumbers flag', () => {
		const { container } = render(Calendar, {
			props: { locale: 'en-US', showWeekNumbers: true },
		});

		expect(container.querySelector('.react-calendar__month-view__weekNumbers')).not.toBeNull();
	});
});
