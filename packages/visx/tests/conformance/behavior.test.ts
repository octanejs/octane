import { afterEach, describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync } from 'octane';
import { mount } from '../../../octane/tests/_helpers';
import {
	AccessibilityFixture,
	BoundsFixture,
	BrushFixture,
	DragFixture,
	HookFamiliesFixture,
	ResponsiveFixture,
	TooltipFixture,
	ZoomFixture,
} from '../_fixtures/behavior.tsrx';

const mounted: Array<ReturnType<typeof mount>> = [];

function render(body, props?) {
	const result = mount(body, props);
	mounted.push(result);
	return result;
}

function settle(): void {
	flushSync(() => {});
	drainPassiveEffects();
	flushSync(() => {});
}

afterEach(() => {
	while (mounted.length > 0) mounted.pop()?.unmount();
	vi.restoreAllMocks();
});

describe('@octanejs/visx stateful behavior', () => {
	it('drives Drag with native pointer events and applies restrictions', () => {
		const view = render(DragFixture);
		const target = view.find('#drag-target');
		vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 160, 100));

		flushSync(() =>
			target.dispatchEvent(
				new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }),
			),
		);
		flushSync(() =>
			target.dispatchEvent(
				new MouseEvent('pointermove', { bubbles: true, clientX: 130, clientY: 90 }),
			),
		);
		expect(target.getAttribute('data-native')).toBe('true');
		expect(Number(target.getAttribute('data-dx'))).toBeLessThanOrEqual(100);
		expect(Number(target.getAttribute('data-dy'))).toBeLessThanOrEqual(80);

		flushSync(() => target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
		expect(target.getAttribute('data-dragging')).toBe('false');
	});

	it('attaches native wheel and pointer listeners for Zoom', () => {
		const view = render(ZoomFixture);
		const target = view.find('#zoom-target');
		vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 120));
		settle();

		flushSync(() =>
			target.dispatchEvent(
				new WheelEvent('wheel', {
					bubbles: true,
					cancelable: true,
					clientX: 50,
					clientY: 30,
					deltaY: -1,
				}),
			),
		);
		expect(target.getAttribute('data-transform')).toContain('1.1');

		flushSync(() =>
			target.dispatchEvent(
				new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 }),
			),
		);
		flushSync(() =>
			window.dispatchEvent(
				new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 50 }),
			),
		);
		expect(target.getAttribute('data-dragging')).toBe('true');
		expect(target.getAttribute('data-transform')).not.toContain(', 0, 0)');
		flushSync(() => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
		expect(target.getAttribute('data-dragging')).toBe('false');
	});

	it('uses initial responsive dimensions, then applies ResizeObserver measurements', () => {
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			callback(0);
			return 1;
		});
		let callback;
		class ResizeObserverImpl {
			constructor(next) {
				callback = next;
			}
			observe() {}
			disconnect() {}
		}
		const view = render(ResponsiveFixture, { ResizeObserverImpl });
		expect(view.find('[data-testid="responsive-output"]').textContent).toBe('120x80');
		settle();
		flushSync(() => callback([{ contentRect: { width: 260, height: 140, top: 5, left: 7 } }]));
		expect(view.find('[data-testid="responsive-output"]').textContent).toBe('260x140');
	});

	it('preserves Brush class-controller state and reports native drag bounds', () => {
		const view = render(BrushFixture);
		const selection = view.find('.visx-brush-selection');
		expect(selection.getAttribute('x')).toBe('20');
		expect(selection.getAttribute('y')).toBe('10');
		expect(selection.getAttribute('width')).toBe('60');
		expect(selection.getAttribute('height')).toBe('40');

		const overlay = view.find('.visx-brush-overlay');
		vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));
		flushSync(() =>
			overlay.dispatchEvent(
				new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }),
			),
		);
		flushSync(() =>
			overlay.dispatchEvent(
				new MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 60 }),
			),
		);
		flushSync(() => overlay.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));

		expect(view.find('.visx-brush-selection').getAttribute('width')).toBe('60');
		expect(view.find('.visx-brush-selection').getAttribute('height')).toBe('50');
		// Visx expands continuous domains by SAFE_PIXEL so thin brushes remain selectable.
		expect(view.find('#brush-bounds').textContent).toBe('4,36,4,31');
	});

	it('measures bounds after mount through the Octane lifecycle adapter', () => {
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
			return this.id === 'bounds-parent'
				? new DOMRect(0, 0, 300, 200)
				: new DOMRect(10, 20, 120, 80);
		});
		const view = render(BoundsFixture);
		settle();
		const probe = view.find('#bounds-probe');
		expect(probe.getAttribute('data-width')).toBe('120');
		expect(probe.getAttribute('data-parent-width')).toBe('300');
	});

	it('shows classic portal tooltips and drives the floating tooltip hook', () => {
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			callback(0);
			return 1;
		});
		const view = render(TooltipFixture);
		settle();
		const floating = view.find('#floating-state');
		expect(floating.getAttribute('data-open')).toBe('true');
		expect(floating.getAttribute('data-side')).toBe('right');
		expect(floating.getAttribute('data-align')).toBe('start');
		expect(floating.textContent).toBe('floating-data');

		flushSync(() =>
			view.find('#show-tooltip').dispatchEvent(new MouseEvent('click', { bubbles: true })),
		);
		settle();
		settle();
		const classic = document.body.querySelector('[data-testid="classic-tooltip"]');
		expect(classic?.textContent).toBe('classic-data');
		expect(classic?.parentElement?.style.zIndex).toBe('17');

		flushSync(() =>
			view.find('#close-floating').dispatchEvent(new MouseEvent('click', { bubbles: true })),
		);
		expect(view.find('#floating-state').getAttribute('data-open')).toBe('false');
	});

	it('renders accessible descriptions, table semantics, and native keyboard navigation', () => {
		const view = render(AccessibilityFixture);
		const svg = view.find('svg');
		expect(svg.getAttribute('role')).toBe('graphics-document');
		expect(svg.getAttribute('aria-describedby')).toBe('behavior-chart-description');
		expect(view.find('table').querySelectorAll('tbody tr')).toHaveLength(2);
		expect(view.find('caption').textContent).toContain('Quarterly values');

		flushSync(() =>
			svg.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })),
		);
		settle();
		expect(view.find('circle').getAttribute('data-a11y-focused')).toBe('true');
	});

	it('covers current axis/scale/shape/voronoi/chart/kernel/theme hook families', () => {
		const view = render(HookFamiliesFixture);
		const result = view.find('#hook-families');
		expect(result.getAttribute('data-size')).toBe('240x160');
		expect(result.getAttribute('data-scale')).toBe('50');
		expect(Number(result.getAttribute('data-ticks'))).toBeGreaterThan(1);
		expect(result.getAttribute('data-arcs')).toBe('3');
		expect(Number(result.getAttribute('data-polygon'))).toBeGreaterThan(2);
		expect(result.getAttribute('data-stable-id')).toMatch(/^behavior-/);
		expect(view.find('#theme-probe').textContent).toContain('light:var(');
	});
});
