import { describe, expect, it } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers.ts';
import {
	CalendarFixture,
	ControlledNavigationFixture,
	ConstraintsFixture,
	MultipleFixture,
	NavigationFixture,
	RangeFixture,
	TimeZoneNavigationFixture,
	UncontrolledBoundsFixture,
} from './_fixtures/calendar.tsrx';

const dayButton = (container: HTMLElement, label: string) =>
	[...container.querySelectorAll('button')].find(
		(button) => button.textContent === label,
	) as HTMLButtonElement;

describe('react-day-picker v10.0.1 adapted calendar behavior', () => {
	// @parity-case runtime:calendar-grid
	it('renders the pinned month as an accessible grid', () => {
		const view = mount(CalendarFixture);
		expect(view.container.querySelector('[role="grid"]')).not.toBeNull();
		expect(view.container.textContent).toContain('August 2026');
		view.unmount();
	});

	// @parity-case runtime:single-selection
	it('selects a day through the public onSelect contract', async () => {
		const view = mount(CalendarFixture);
		const day = dayButton(view.container, '15');
		await act(() => day.click());
		expect(view.container.querySelector('#selection')?.textContent).toBe('2026-08-15');
		expect(day.closest('[role="gridcell"]')?.getAttribute('aria-selected')).toBe('true');
		view.unmount();
	});

	// @parity-case runtime:month-navigation
	it('navigates to the next month through the public nav button', async () => {
		const view = mount(NavigationFixture);
		const next = view.container.querySelector('button[aria-label*="next"]') as HTMLButtonElement;
		await act(() => next.click());
		expect(view.container.textContent).toContain('September 2026');
		view.unmount();
	});

	// @parity-case runtime:uncontrolled-month-identity
	it('preserves an uncontrolled visible month and public props when bounds change', async () => {
		const view = mount(UncontrolledBoundsFixture);
		const next = view.container.querySelector('button[aria-label*="next"]') as HTMLButtonElement;
		await act(() => next.click());
		expect(view.container.textContent).toContain('September 2026');
		await act(() => dayButton(view.container, 'Change bounds').click());
		expect(view.container.textContent).toContain('September 2026');
		const footer = view.container.querySelector('[data-has-month]');
		expect(footer?.getAttribute('data-has-month')).toBe('false');
		expect(footer?.getAttribute('data-has-on-month-change')).toBe('false');
		view.unmount();
	});

	// @parity-case runtime:controlled-month-navigation
	it('keeps a controlled month pinned while reporting navigation', async () => {
		const view = mount(ControlledNavigationFixture);
		const next = view.container.querySelector('button[aria-label*="next"]') as HTMLButtonElement;
		await act(() => next.click());
		expect(view.container.textContent).toContain('August 2026');
		expect(view.container.querySelector('#requested-month')?.textContent).toBe('2026-09');
		view.unmount();
	});

	// @parity-case runtime:uncontrolled-time-zone-reset
	it('resets an uncontrolled month when the time zone changes', async () => {
		const view = mount(TimeZoneNavigationFixture);
		expect(view.container.textContent).toContain('August 2026');
		const changeZone = dayButton(view.container, 'Use Los Angeles');
		await act(() => changeZone.click());
		expect(view.container.textContent).toContain('July 2026');
		view.unmount();
	});

	// @parity-case runtime:multiple-selection
	it('toggles multiple selected days', async () => {
		const view = mount(MultipleFixture);
		await act(() => dayButton(view.container, '8').click());
		await act(() => dayButton(view.container, '9').click());
		expect(view.container.querySelector('#multiple-count')?.textContent).toBe('2');
		await act(() => dayButton(view.container, '8').click());
		expect(view.container.querySelector('#multiple-count')?.textContent).toBe('1');
		view.unmount();
	});

	// @parity-case runtime:range-selection
	it('builds a range from two day clicks', async () => {
		const view = mount(RangeFixture);
		await act(() => dayButton(view.container, '12').click());
		await act(() => dayButton(view.container, '16').click());
		expect(view.container.querySelector('#range-value')?.textContent).toBe('12:16');
		view.unmount();
	});

	// @parity-case runtime:constraints-and-custom-components
	it('applies disabled, hidden, outside-day, and custom component contracts', () => {
		const view = mount(ConstraintsFixture);
		const disabled = view.container.querySelector(
			'[data-day="2026-08-10"] button',
		) as HTMLButtonElement;
		expect(disabled, view.container.innerHTML).not.toBeNull();
		expect(disabled.disabled).toBe(true);
		expect(view.container.querySelector('[data-day="2026-08-11"] button')).toBeNull();
		expect(view.container.querySelectorAll('[data-custom-day="true"]').length).toBeGreaterThan(35);
		expect(view.container.querySelector('[data-outside="true"]')).not.toBeNull();
		view.unmount();
	});
});
