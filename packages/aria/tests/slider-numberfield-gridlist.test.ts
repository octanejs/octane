import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	SliderHarness,
	NumberFieldHarness,
	GridListHarness,
	TagGroupHarness,
	BreadcrumbsHarness,
} from './_fixtures/slider-numberfield-gridlist.tsx';

// jsdom lacks CSS.escape (used by the selection delegates' data-key selectors).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// Behavioral coverage for the Phase-2 slider/numberfield/gridlist/tag/breadcrumbs aria
// hook families. These exercise the DOM prop bags each hook produces over its ported
// stately state — the roles, range/step wiring, roving structure, and interactions a
// consumer observes.

describe('@octanejs/aria — useSlider / useSliderThumb', () => {
	it('wires role=group, a range input reflecting the state, and slider aria bounds', async () => {
		const r = mount(SliderHarness, {});
		await act(() => {});
		const group = r.container.querySelector('[role="group"]') as HTMLElement;
		expect(group).toBeTruthy();
		const input = r.container.querySelector('[data-testid="thumb-input"]') as HTMLInputElement;
		expect(input.type).toBe('range');
		// Bounds and step come straight from useSliderState.
		expect(input.getAttribute('min')).toBe('0');
		expect(input.getAttribute('max')).toBe('100');
		expect(input.getAttribute('step')).toBe('10');
		// The single thumb sits at the default value.
		expect(input.value).toBe('20');
		// The formatted value label is exposed to AT.
		expect(input.getAttribute('aria-valuetext')).toBe('20');
		r.unmount();
	});
});

describe('@octanejs/aria — useNumberField', () => {
	it('wires role=group, a formatted value input, and stepper buttons that change the value', async () => {
		const r = mount(NumberFieldHarness, {});
		await act(() => {});
		const group = r.container.querySelector('[role="group"]') as HTMLElement;
		expect(group).toBeTruthy();
		const input = r.container.querySelector('[data-testid="nf-input"]') as HTMLInputElement;
		// useNumberField deliberately strips the spinbutton role/values off the input
		// (VoiceOver can't focus a spin button), so the value lives on the DOM value, not
		// aria-valuenow — mirroring react-aria exactly.
		expect(input.getAttribute('role')).toBe(null);
		expect(input.value).toBe('5');
		const inc = r.container.querySelector('[data-testid="inc"]') as HTMLElement;
		// The stepper labels interpolate the field label ("Increase {fieldLabel}") — a raw
		// uninterpolated placeholder here means the intl dictionary compile step regressed.
		expect(inc.getAttribute('aria-label')).toBe('Increase Amount');
		const dec = r.container.querySelector('[data-testid="dec"]') as HTMLElement;
		expect(dec.getAttribute('aria-label')).toBe('Decrease Amount');
		await act(() => inc.click());
		expect(input.value).toBe('6');
		r.unmount();
	});
});

describe('@octanejs/aria — useGridList / useGridListItem', () => {
	it('wires role=grid with role=row rows and gridcells, and click selects a row', async () => {
		const r = mount(GridListHarness, {});
		await act(() => {});
		const grid = r.container.querySelector('[role="grid"]') as HTMLElement;
		expect(grid).toBeTruthy();
		const rows = r.container.querySelectorAll('[role="row"]');
		expect(rows.length).toBe(3);
		expect(r.container.querySelectorAll('[role="gridcell"]').length).toBe(3);
		// The first row is the initial tab stop (roving tabindex).
		expect((rows[0] as HTMLElement).getAttribute('aria-selected')).toBe('false');
		await act(() => (rows[0] as HTMLElement).click());
		expect((rows[0] as HTMLElement).getAttribute('aria-selected')).toBe('true');
		r.unmount();
	});

	it('announces selection changes with interpolated and pluralized messages', async () => {
		const r = mount(GridListHarness, {});
		await act(() => {});
		const rows = r.container.querySelectorAll('[role="row"]');
		const grid = r.container.querySelector('[role="grid"]') as HTMLElement;
		// The live announcer is a document-level singleton shared with other tests, so
		// assert on entries appended after each step rather than absolute region content.
		const log = () => document.querySelector('[data-live-announcer] [aria-live="assertive"]');
		let seen = log()?.childElementCount ?? 0;
		const lastAnnouncement = () => {
			const el = log();
			expect(el?.childElementCount ?? 0).toBeGreaterThan(seen);
			seen = el!.childElementCount;
			return el!.lastElementChild!.textContent;
		};

		// Selection is only announced while the collection is focused; clicks alone don't
		// move DOM focus in jsdom, so focus the first row the way the roving tabindex would.
		await act(() => (rows[0] as HTMLElement).focus());
		// Selecting a single row interpolates its text into the {item} placeholder.
		await act(() => (rows[0] as HTMLElement).click());
		expect(lastAnnouncement()).toBe('Alpha selected.');

		// A second selection also announces the count — the ICU plural `other` branch,
		// with `#` formatted through the locale number formatter.
		await act(() => (rows[1] as HTMLElement).click());
		expect(lastAnnouncement()).toBe('Bravo selected. 2 items selected.');

		// Deselecting one row exercises the `one` branch.
		await act(() => (rows[0] as HTMLElement).click());
		expect(lastAnnouncement()).toBe('Alpha not selected. 1 item selected.');

		// Re-select to two rows, then clear with Escape: a multi-row removal announces only
		// the count, exercising the exact `=0` branch.
		await act(() => (rows[0] as HTMLElement).click());
		expect(lastAnnouncement()).toBe('Alpha selected. 2 items selected.');
		await act(() =>
			grid.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			),
		);
		expect(lastAnnouncement()).toBe('No items selected.');
		r.unmount();
	});
});

describe('@octanejs/aria — useTagGroup / useTag', () => {
	it('wires a populated grid of role=row tags with gridcells', async () => {
		const r = mount(TagGroupHarness, {});
		await act(() => {});
		// A non-empty tag collection is a grid; each tag is a row with a gridcell.
		const grid = r.container.querySelector('[role="grid"]') as HTMLElement;
		expect(grid).toBeTruthy();
		expect(r.container.querySelectorAll('[role="row"]').length).toBe(2);
		expect(r.container.querySelectorAll('[role="gridcell"]').length).toBe(2);
		r.unmount();
	});
});

describe('@octanejs/aria — useBreadcrumbs / useBreadcrumbItem', () => {
	it('labels the nav and marks the current crumb with aria-current', async () => {
		const r = mount(BreadcrumbsHarness, {});
		await act(() => {});
		const nav = r.container.querySelector('nav') as HTMLElement;
		expect(nav.getAttribute('aria-label')).toBe('Trail');
		const crumbs = r.container.querySelectorAll('nav span');
		expect(crumbs.length).toBe(2);
		// The non-current crumb is not marked; the current one is page.
		expect((crumbs[0] as HTMLElement).getAttribute('aria-current')).toBe(null);
		expect((crumbs[1] as HTMLElement).getAttribute('aria-current')).toBe('page');
		r.unmount();
	});
});
