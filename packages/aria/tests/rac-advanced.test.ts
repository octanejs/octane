import { describe, expect, it, vi } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import { Rect, Size, UNSTABLE_ToastQueue, parseColor } from '../src/components';
import {
	CalendarScenario,
	ColorFieldScenario,
	DateFieldScenario,
	DateSegmentPropsScenario,
	DropZoneScenario,
	FileTriggerScenario,
	ListDataScenario,
} from './_fixtures/rac-advanced.tsx';

describe('@octanejs/aria/components — advanced React Aria Components families', () => {
	it('renders and selects dates in a Calendar', async () => {
		const onChange = vi.fn();
		const r = mount(CalendarScenario, { onChange });
		const calendar = r.container.querySelector('.react-aria-Calendar')!;
		expect(calendar.getAttribute('aria-label')).toBe('Appointment date, August 2026');
		expect(calendar.querySelector('.react-aria-Heading')!.textContent).toContain('August 2026');

		const selected = calendar.querySelector('[role="gridcell"] [data-selected]') as HTMLElement;
		expect(selected.textContent).toBe('18');
		const nextDate = [...calendar.querySelectorAll<HTMLElement>('.react-aria-CalendarCell')].find(
			(cell) => cell.textContent === '19' && !cell.hasAttribute('data-outside-month'),
		)!;
		await act(() => nextDate.click());
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(String(onChange.mock.calls[0][0])).toBe('2026-08-19');
		expect(nextDate.getAttribute('data-selected')).toBe('true');
		r.unmount();
	});

	it('renders a localized DateField as editable date segments', () => {
		const r = mount(DateFieldScenario);
		const field = r.container.querySelector('.react-aria-DateField')!;
		expect(field.querySelector('.react-aria-Label')!.textContent).toBe('Birth date');
		const segments = [...field.querySelectorAll<HTMLElement>('.react-aria-DateSegment')];
		expect(
			segments.filter((segment) => segment.getAttribute('role') === 'spinbutton'),
		).toHaveLength(3);
		expect(segments.map((segment) => segment.getAttribute('data-type'))).toEqual([
			'month',
			'literal',
			'day',
			'literal',
			'year',
		]);
		expect(field.textContent).toContain('8/18/2026');
		r.unmount();
	});

	it('updates a DateField when the hidden native date input receives input', async () => {
		const r = mount(DateFieldScenario);
		const field = r.container.querySelector('.react-aria-DateField')!;
		const input = r.container.querySelector('input[type="date"]') as HTMLInputElement;
		expect(input.value).toBe('2026-08-18');

		input.value = '2027-09-22';
		await act(() => input.dispatchEvent(new InputEvent('input', { bubbles: true })));

		expect(field.textContent).toContain('9/22/2027');
		expect(input.value).toBe('2027-09-22');
		r.unmount();
	});

	it('returns the modern enterKeyHint prop for editable date segments', () => {
		const r = mount(DateSegmentPropsScenario);
		const editable = r.container.querySelectorAll(
			'[data-segment-type="month"], [data-segment-type="day"], [data-segment-type="year"]',
		);
		expect(editable).toHaveLength(3);
		for (const segment of editable) {
			expect(segment.getAttribute('data-enter-key-hint-prop')).toBe('true');
		}
		r.unmount();
	});

	it('uses native input events to update a ColorField', async () => {
		const onChange = vi.fn();
		const r = mount(ColorFieldScenario, { onChange });
		const field = r.container.querySelector('.react-aria-ColorField')!;
		const input = field.querySelector('input') as HTMLInputElement;
		expect(field.getAttribute('data-channel')).toBe('hex');
		expect(input.value).toBe('#FFFF00');

		input.value = '#00ff00';
		await act(() => input.dispatchEvent(new InputEvent('input', { bubbles: true })));
		expect(input.value).toBe('#00ff00');
		await act(() => {
			input.focus();
			input.blur();
		});
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange.mock.calls[0][0].toString('hex')).toBe('#00FF00');
		r.unmount();
	});

	it('wires FileTrigger options to its hidden native file input', () => {
		const r = mount(FileTriggerScenario);
		const button = r.container.querySelector('button')!;
		const input = r.container.querySelector('input[type="file"]') as HTMLInputElement;
		expect(button.textContent).toBe('Choose files');
		expect(input.accept).toBe('image/png,image/jpeg');
		expect(input.multiple).toBe(true);
		expect(input.getAttribute('webkitdirectory')).toBe('');
		expect(input.style.display).toBe('none');
		r.unmount();
	});

	it('renders a labelled DropZone and moves focus to its drop button', async () => {
		const r = mount(DropZoneScenario);
		const zone = r.container.querySelector('.react-aria-DropZone') as HTMLElement;
		const button = zone.querySelector('button')!;
		expect(zone.textContent).toContain('Drop files here');
		expect(button.getAttribute('aria-label')).toBe('Upload files');
		await act(() => zone.click());
		expect(document.activeElement).toBe(button);
		r.unmount();
	});

	it('updates list data through the public useListData hook', async () => {
		const r = mount(ListDataScenario);
		const output = r.container.querySelector('[data-testid="items"]')!;
		expect(output.textContent).toBe('Alpha,Beta');
		await act(() => (r.container.querySelector('#append-item') as HTMLElement).click());
		expect(output.textContent).toBe('Alpha,Beta,Gamma');
		await act(() => (r.container.querySelector('#remove-item') as HTMLElement).click());
		expect(output.textContent).toBe('Beta,Gamma');
		r.unmount();
	});

	it('exposes color parsing and ordered toast queue behavior', () => {
		expect(parseColor('#0f0').toString('hex')).toBe('#00FF00');

		const queue = new UNSTABLE_ToastQueue<string>({ maxVisibleToasts: 2 });
		const first = queue.add('first');
		queue.add('second');
		queue.add('third');
		expect(queue.visibleToasts.map((toast) => toast.content)).toEqual(['third', 'second']);
		queue.close(first);
		expect(queue.visibleToasts.map((toast) => toast.content)).toEqual(['third', 'second']);
		queue.clear();
		expect(queue.visibleToasts).toEqual([]);
	});

	it('exposes virtualized layout geometry with upstream behavior', () => {
		const size = new Size(12, 5);
		expect(size.area).toBe(60);
		expect(size.copy().equals(size)).toBe(true);

		const rect = new Rect(10, 20, 30, 40);
		expect(rect.maxX).toBe(40);
		expect(rect.maxY).toBe(60);
		expect(rect.containsRect(new Rect(15, 25, 5, 5))).toBe(true);
	});
});
