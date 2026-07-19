import { beforeAll, describe, expect, it } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	ArrowDefault,
	ArrowFromContext,
	ArrowStyleFunction,
	IndicatorFromContext,
	IndicatorStates,
	SharedHandoff,
	SharedNoScope,
	SharedToggle,
} from './_fixtures/rac-support.tsx';

// @octanejs/aria Phase 4 support components — OverlayArrow, SelectionIndicator,
// SharedElementTransition/SharedElement. jsdom cannot observe pixels or real
// animations (rects are zero, transitions never run), so these tests assert the
// DOM contract: rendered structure, data attributes, context routing, and the
// mount/unmount lifecycle.

// jsdom gap: the Web Animations API. SharedElementTransition calls
// element.getAnimations() on its transition and exit paths; stub it the same
// way a browser with no active animations would answer.
beforeAll(() => {
	if (typeof (Element.prototype as any).getAnimations !== 'function') {
		(Element.prototype as any).getAnimations = () => [];
	}
});

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('@octanejs/aria/components — OverlayArrow', () => {
	it('renders with the default context placement (bottom) and positioning styles', () => {
		const r = mount(ArrowDefault);
		const el = r.find('[data-testid="arrow"]') as HTMLElement;
		expect(el.getAttribute('data-placement')).toBe('bottom');
		expect(el.className).toBe('react-aria-OverlayArrow');
		expect(el.getAttribute('data-rac')).toBe('');
		expect(el.style.position).toBe('absolute');
		expect(el.style.transform).toBe('translateX(-50%)');
		expect(el.style.bottom).toBe('100%');
		expect(el.textContent).toBe('▲');
		r.unmount();
	});

	it('takes placement from OverlayArrowContext and exposes it to render props', () => {
		const r = mount(ArrowFromContext, { placement: 'left' });
		const el = r.find('[data-testid="arrow"]') as HTMLElement;
		expect(el.getAttribute('data-placement')).toBe('left');
		// Cross-axis placements center vertically and pin to the opposite edge.
		expect(el.style.transform).toBe('translateY(-50%)');
		expect(el.style.left).toBe('100%');
		// The className function received the context placement.
		expect(el.className).toBe('arrow-left');
		// filterDOMProps keeps shared DOM props (id, data-*) and, without the
		// labelable option, drops aria labeling props — matching upstream.
		expect(el.id).toBe('arrow-id');
		expect(el.hasAttribute('aria-label')).toBe(false);
		r.unmount();
	});

	it('strips undefined style values so they cannot clobber the positioning styles', () => {
		const r = mount(ArrowStyleFunction);
		const el = r.find('[data-testid="arrow"]') as HTMLElement;
		expect(el.style.position).toBe('absolute');
		expect(el.style.background).toBe('rgb(255, 0, 0)');
		r.unmount();
	});
});

describe('@octanejs/aria/components — SelectionIndicator', () => {
	it('renders only when selected, with the default className', () => {
		const r = mount(IndicatorStates);
		const on = r.find('[data-testid="sel-on"]') as HTMLElement;
		expect(on.className).toBe('react-aria-SelectionIndicator');
		expect(on.textContent).toBe('on');
		// The unselected indicator resolves to a hidden SharedElement → no DOM.
		expect(r.container.querySelector('[data-testid="sel-off"]')).toBeNull();
		r.unmount();
	});

	it('receives isSelected and other props from SelectionIndicatorContext', () => {
		const r = mount(IndicatorFromContext);
		const el = r.find('[data-testid="sel-ctx"]') as HTMLElement;
		expect(el.getAttribute('data-from-ctx')).toBe('yes');
		expect(el.textContent).toBe('ctx');
		r.unmount();
	});
});

describe('@octanejs/aria/components — SharedElementTransition', () => {
	it('SharedElement outside a SharedElementTransition throws', () => {
		expect(() => mount(SharedNoScope)).toThrow(
			'<SharedElement> must be rendered inside a <SharedElementTransition>',
		);
	});

	it('runs the entering lifecycle on first appearance and settles to visible', async () => {
		const r = mount(SharedToggle, { visible: true });
		const el = () => r.container.querySelector('[data-testid="shared"]') as HTMLElement | null;
		// Mounts immediately in the visible state.
		expect(el()).not.toBeNull();
		// After layout effects flush their microtask, the element is entering —
		// visible via both the data attribute and the className render prop.
		await act(() => {});
		expect(el()!.hasAttribute('data-entering')).toBe(true);
		expect(el()!.className).toBe('se is-entering');
		// One frame later it settles to plain visible.
		await act(async () => {
			await nextFrame();
		});
		expect(el()!.hasAttribute('data-entering')).toBe(false);
		expect(el()!.hasAttribute('data-exiting')).toBe(false);
		expect(el()!.className).toBe('se');
		r.unmount();
	});

	it('exits and unmounts once its animations finish when isVisible turns off', async () => {
		const r = mount(SharedToggle, { visible: true });
		await act(async () => {
			await nextFrame();
		});
		const el = () => r.container.querySelector('[data-testid="shared"]');
		expect(el()).not.toBeNull();

		r.update(SharedToggle, { visible: false });
		// Still present until the exit check runs in a microtask.
		expect(el()).not.toBeNull();
		// No other instance consumed the snapshot → exiting, then (with no
		// animations to wait for in jsdom) hidden and removed from the DOM.
		await act(() => {});
		expect(el()).toBeNull();
		// The host wrapper remains; only the SharedElement unmounted.
		expect(r.container.querySelector('[data-testid="host"]')).not.toBeNull();
		r.unmount();
	});

	it('hands the element off between same-name instances without re-entering', async () => {
		const r = mount(SharedHandoff, { active: 'a' });
		await act(async () => {
			await nextFrame();
		});
		expect(r.container.querySelector('[data-testid="a"]')).not.toBeNull();
		expect(r.container.querySelector('[data-testid="b"]')).toBeNull();

		r.update(SharedHandoff, { active: 'b' });
		// The new instance shows immediately (it consumed the old snapshot).
		const b = r.container.querySelector('[data-testid="b"]') as HTMLElement;
		expect(b).not.toBeNull();
		expect(b.textContent).toBe('B');
		await act(() => {});
		// The handoff target never re-enters, and the old instance unmounted
		// once its snapshot was consumed.
		expect(b.hasAttribute('data-entering')).toBe(false);
		expect(r.container.querySelector('[data-testid="a"]')).toBeNull();
		// Let the transition-restore frame run before unmounting.
		await act(async () => {
			await nextFrame();
		});
		r.unmount();
	});
});
