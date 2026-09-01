import { afterEach, describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync } from 'octane';
import { mount } from '../../../octane/tests/_helpers';
import {
	AccessibilityFixture,
	BoundsFixture,
	BrushFixture,
	CategoricalScaleFixture,
	HookFamiliesFixture,
	ResponsiveEnhancersFixture,
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
	it('preserves first-match categorical colors, palette wrapping, and missing-key fallbacks', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const domain = Array.from({ length: 64 }, (_, index) => `key-${index}`);
		domain[0] = 'alpha';
		domain[1] = 'beta';
		domain[3] = 'gamma';
		domain[62] = 'alpha';
		const view = render(CategoricalScaleFixture, {
			domain,
			keys: ['alpha', 'beta', 'gamma', 'missing'],
			range: ['red', 'green', 'blue'],
		});
		const probe = view.find('#categorical-scale-probe');
		const categorical = probe.getAttribute('data-categorical')?.split('|');

		expect(probe.getAttribute('data-color')).toBe('red|green|red|red');
		expect(categorical).toHaveLength(4);
		expect(categorical?.[0]).toBe(categorical?.[3]);
		expect(categorical?.[1]).not.toBe(categorical?.[0]);
		expect(categorical?.[2]).not.toBe(categorical?.[0]);
		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn).toHaveBeenNthCalledWith(
			1,
			'[@octanejs/visx/theme] useCategoricalScale received "missing" outside its domain; using index 0.',
		);
		expect(warn).toHaveBeenNthCalledWith(
			2,
			'[@octanejs/visx/theme] useColorScale received "missing" outside its domain; using index 0.',
		);
	});

	it('rebuilds categorical scales when domain, range, or theme inputs change', () => {
		const view = render(CategoricalScaleFixture, {
			domain: ['alpha', 'beta'],
			keys: ['beta'],
			range: ['red', 'green'],
		});
		const probe = view.find('#categorical-scale-probe');
		const initialCategorical = probe.getAttribute('data-categorical');

		expect(probe.getAttribute('data-color')).toBe('green');

		view.update(CategoricalScaleFixture, {
			domain: ['beta', 'alpha'],
			keys: ['beta'],
			range: ['red', 'green'],
		});

		expect(probe.getAttribute('data-color')).toBe('red');
		expect(probe.getAttribute('data-categorical')).not.toBe(initialCategorical);
		const domainCategorical = probe.getAttribute('data-categorical');

		view.update(CategoricalScaleFixture, {
			domain: ['beta', 'alpha'],
			keys: ['beta'],
			range: ['blue', 'orange'],
		});

		expect(probe.getAttribute('data-color')).toBe('blue');
		expect(probe.getAttribute('data-categorical')).toBe(domainCategorical);

		const themedView = render(CategoricalScaleFixture, {
			domain: ['alpha', 'beta'],
			keys: ['beta'],
			range: ['red', 'green'],
			theme: 'light',
		});
		const themedProbe = themedView.find('#categorical-scale-probe');
		const lightCategorical = themedProbe.getAttribute('data-categorical');

		themedView.update(CategoricalScaleFixture, {
			domain: ['alpha', 'beta'],
			keys: ['beta'],
			range: ['red', 'green'],
			theme: 'dark',
		});

		expect(themedProbe.getAttribute('data-color')).toBe('green');
		expect(themedProbe.getAttribute('data-categorical')).not.toBe(lightCategorical);
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

	it('runs responsive enhancers through functional effects and state', () => {
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			callback(0);
			return 1;
		});
		Object.defineProperties(window, {
			innerWidth: { configurable: true, value: 1024 },
			innerHeight: { configurable: true, value: 768 },
		});
		let callback;
		const observe = vi.fn();
		class ResizeObserverImpl {
			constructor(next) {
				callback = next;
			}
			observe = observe;
			disconnect() {}
		}

		const view = render(ResponsiveEnhancersFixture, { ResizeObserverImpl });
		expect(view.find('#parent-size-enhancer').textContent).toBe('90x45');
		settle();
		expect(observe).toHaveBeenCalledOnce();
		expect(view.find('#screen-size-enhancer').textContent).toBe('1024x768');

		flushSync(() => callback([{ contentRect: { width: 180, height: 90 } }]));
		expect(view.find('#parent-size-enhancer').textContent).toBe('180x90');
	});

	it('preserves functional Brush state and reports native drag bounds', () => {
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

	it('measures bounds after mount through native Octane layout effects', () => {
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
