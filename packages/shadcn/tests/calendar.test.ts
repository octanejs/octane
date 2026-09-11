import { describe, expect, it } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import {
	CalendarDisabledFixture,
	CalendarDropdownFixture,
	CalendarOutsideDaysFixture,
	CalendarRangeFixture,
	CalendarSingleFixture,
	CalendarWeekNumberFixture,
	RadixCalendarFixture,
} from './_fixtures/calendar-app.tsrx';

// Every fixture pins January 2024, so day identity is addressable by the cell's own
// `data-day` (day-picker's ISO value), never by position or by "today".
const cell = (container: HTMLElement, iso: string) =>
	container.querySelector(`[role="gridcell"][data-day="${iso}"]`) as HTMLElement;
const dayButton = (container: HTMLElement, iso: string) =>
	cell(container, iso).querySelector('button') as HTMLButtonElement;
const selectedOutput = (container: HTMLElement) =>
	(container.querySelector('[data-testid="selected"]') as HTMLElement).textContent;

function click(el: Element): void {
	flushSync(() => {
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	});
}

describe('@octanejs/shadcn — Calendar', () => {
	it('renders the calendar slot, the cell-size variables, and a labelled month grid', () => {
		const { container, unmount } = mount(CalendarSingleFixture);
		const root = container.querySelector('[data-slot="calendar"]') as HTMLElement;
		expect(root).not.toBeNull();
		// The Nova `.cn-calendar` rule is inlined here, so the two variables every
		// downstream `size-(--cell-size)` reads are declared on the root itself.
		expect(root.className).toContain('[--cell-size:--spacing(7)]');
		expect(root.className).toContain('[--cell-radius:var(--radius-md)]');
		expect(root.className).toContain('w-fit');
		expect(root.getAttribute('data-mode')).toBe('single');

		const grid = container.querySelector('table[role="grid"]') as HTMLElement;
		expect(grid.getAttribute('aria-label')).toBe('January 2024');
		expect(container.querySelectorAll('th.rdp-weekday').length).toBe(7);
		expect(container.querySelectorAll('[role="gridcell"]').length).toBe(35);
		unmount();
	});

	it('selects a day, marks it single-selected, and reports it to the consumer', () => {
		const { container, unmount } = mount(CalendarSingleFixture);
		expect(selectedOutput(container)).toBe('none');

		click(dayButton(container, '2024-01-15'));

		expect(selectedOutput(container)).toBe('2024-01-15');
		expect(cell(container, '2024-01-15').getAttribute('data-selected')).toBe('true');
		expect(dayButton(container, '2024-01-15').getAttribute('data-selected-single')).toBe('true');
		expect(dayButton(container, '2024-01-16').getAttribute('data-selected-single')).not.toBe(
			'true',
		);
		unmount();
	});

	it('updates the existing day buttons on selection instead of replacing them', () => {
		const { container, unmount } = mount(CalendarSingleFixture);
		const before = dayButton(container, '2024-01-15');
		const neighbour = dayButton(container, '2024-01-16');

		click(before);

		// The `components` overrides are module-level, so their component types survive the
		// re-render. Inline overrides would make every cell in the grid a new type and remount
		// all 35 of them on each selection.
		expect(dayButton(container, '2024-01-15')).toBe(before);
		expect(dayButton(container, '2024-01-16')).toBe(neighbour);
		unmount();
	});

	it('distinguishes range start, middle, and end on the day buttons', () => {
		const { container, unmount } = mount(CalendarRangeFixture);
		expect(dayButton(container, '2024-01-10').getAttribute('data-range-start')).toBe('true');
		expect(dayButton(container, '2024-01-11').getAttribute('data-range-middle')).toBe('true');
		expect(dayButton(container, '2024-01-12').getAttribute('data-range-end')).toBe('true');
		// A single-day marker must not appear for a range selection.
		expect(dayButton(container, '2024-01-10').getAttribute('data-selected-single')).toBe('false');
		unmount();
	});

	it('navigates months through the previous/next buttons', () => {
		const { container, unmount } = mount(CalendarSingleFixture);
		const grid = () => container.querySelector('table[role="grid"]') as HTMLElement;
		const next = container.querySelector('.rdp-button_next') as HTMLElement;
		const previous = container.querySelector('.rdp-button_previous') as HTMLElement;

		click(next);
		expect(grid().getAttribute('aria-label')).toBe('February 2024');
		click(previous);
		expect(grid().getAttribute('aria-label')).toBe('January 2024');
		unmount();
	});

	it('renders directional chevrons that mirror in RTL and a plain dropdown chevron', () => {
		const { container, unmount } = mount(CalendarSingleFixture);
		const previousIcon = container.querySelector('.rdp-button_previous svg') as SVGElement;
		const nextIcon = container.querySelector('.rdp-button_next svg') as SVGElement;
		expect(previousIcon.getAttribute('class')).toContain('lucide-chevron-left');
		expect(nextIcon.getAttribute('class')).toContain('lucide-chevron-right');
		// theme.css defines `[dir='rtl'] .cn-rtl-flip`, so the class is shipped unresolved.
		expect(previousIcon.getAttribute('class')).toContain('cn-rtl-flip');
		expect(nextIcon.getAttribute('class')).toContain('cn-rtl-flip');
		unmount();
	});

	it('renders month and year dropdowns with short month labels', () => {
		const { container, unmount } = mount(CalendarDropdownFixture);
		const months = container.querySelector('.rdp-months_dropdown') as HTMLSelectElement;
		const years = container.querySelector('.rdp-years_dropdown') as HTMLSelectElement;
		expect(months.options.length).toBe(12);
		// The component's own formatter, not day-picker's default full month name.
		expect(months.options[0].textContent).toBe('Jan');
		expect(years.options.length).toBe(3);

		const captionLabel = container.querySelector('.rdp-caption_label') as HTMLElement;
		// The dropdown branch carries the inlined `.cn-calendar-caption-label` rule.
		expect(captionLabel.className).toContain('h-6');
		expect(container.querySelector('.rdp-dropdown_root')?.className).toContain('border-input');
		expect(container.querySelector('.rdp-dropdowns svg')?.getAttribute('class')).toContain(
			'lucide-chevron-down',
		);
		unmount();
	});

	it('keeps the plain caption free of the dropdown-only classes', () => {
		const { container, unmount } = mount(CalendarSingleFixture);
		const captionLabel = container.querySelector('.rdp-caption_label') as HTMLElement;
		expect(captionLabel.textContent).toBe('January 2024');
		expect(captionLabel.className).not.toContain('h-6');
		unmount();
	});

	it('renders week numbers in a cell sized by --cell-size', () => {
		const { container, unmount } = mount(CalendarWeekNumberFixture);
		expect(container.querySelector('.rdp-week_number_header')).not.toBeNull();
		const numbers = container.querySelectorAll('.rdp-week_number');
		expect(numbers.length).toBe(5);
		const inner = numbers[0].querySelector('div') as HTMLElement;
		expect(inner.className).toContain('size-(--cell-size)');
		expect(numbers[0].tagName).toBe('TD');
		unmount();
	});

	it('renders outside days by default and hides them when showOutsideDays is off', () => {
		const shown = mount(CalendarSingleFixture);
		const shownOutside = shown.container.querySelectorAll('.rdp-outside');
		expect(shownOutside.length).toBeGreaterThan(0);
		expect(shownOutside[0].querySelector('button')).not.toBeNull();
		expect(shownOutside[0].className).toContain('text-muted-foreground');
		shown.unmount();

		// day-picker keeps the cell and marks it hidden rather than dropping it, so the
		// week keeps seven columns; the component's `hidden` class string is what makes
		// it disappear.
		const hidden = mount(CalendarOutsideDaysFixture);
		const hiddenOutside = hidden.container.querySelectorAll('.rdp-outside');
		expect(hiddenOutside.length).toBeGreaterThan(0);
		for (const day of hiddenOutside) {
			expect(day.getAttribute('data-hidden')).toBe('true');
			expect(day.className).toContain('invisible');
			expect(day.querySelector('button')).toBeNull();
		}
		hidden.unmount();
	});

	it('refuses selection on a disabled day', () => {
		const { container, unmount } = mount(CalendarDisabledFixture);
		const disabled = dayButton(container, '2024-01-15');
		expect(disabled.disabled).toBe(true);

		click(disabled);

		expect(selectedOutput(container)).toBe('none');
		expect(cell(container, '2024-01-15').getAttribute('data-selected')).toBeNull();
		unmount();
	});

	it('focuses the day button the calendar marks as focused', () => {
		const { container, unmount } = mount(CalendarSingleFixture);
		// Focus lands on a day only through the modifiers.focused effect in
		// CalendarDayButton, which replaces day-picker's own DayButton.
		click(dayButton(container, '2024-01-15'));
		flushEffects();
		expect(document.activeElement).toBe(dayButton(container, '2024-01-15'));
		unmount();
	});

	it('ships the same contract from the Radix base', () => {
		const { container, unmount } = mount(RadixCalendarFixture);
		const root = container.querySelector('[data-slot="calendar"]') as HTMLElement;
		expect(root.className).toContain('[--cell-size:--spacing(7)]');

		click(dayButton(container, '2024-01-20'));

		expect(selectedOutput(container)).toBe('2024-01-20');
		expect(dayButton(container, '2024-01-20').getAttribute('data-selected-single')).toBe('true');
		unmount();
	});
});
