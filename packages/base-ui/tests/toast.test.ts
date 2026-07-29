import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import {
	manager,
	ToastAutoDismiss,
	ToastLimitOne,
	ToastManaged,
} from './_fixtures/toast-behavior.tsrx';

// Behavior tests for Toast — Phase 3g. The differential rig proves the rendered DOM matches Base UI
// after an `add`; what it cannot see is everything the store does over TIME: auto-dismiss timers,
// pausing them on hover, the close/remove two-phase teardown, and the imperative manager API.
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 0));
	}
}

/** Settle until `predicate` holds, or give up. Timer-driven state needs real elapsed time. */
async function settleUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate() && Date.now() < deadline) {
		await settle();
	}
}

/**
 * Dispatch a synthetic pointer event.
 *
 * Swipe IS drivable in jsdom: the gesture math is pure `clientX`/`clientY` deltas, and
 * `getElementTransform` reading `transform: none` simply yields a `{0,0,1}` baseline. (What is NOT
 * drivable is the hover/`safePolygon` family, which needs real `getBoundingClientRect` geometry.)
 * `movementX`/`movementY` are getter-only on jsdom's MouseEvent, so they are defined rather than
 * assigned.
 */
function pointer(
	el: Element | Document,
	type: string,
	x: number,
	y: number,
	movement = { x: 0, y: 0 },
) {
	const event: any = new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: x,
		clientY: y,
		button: 0,
	});
	event.pointerId = 1;
	event.pointerType = 'mouse';
	Object.defineProperty(event, 'movementX', { value: movement.x, configurable: true });
	Object.defineProperty(event, 'movementY', { value: movement.y, configurable: true });
	flushSync(() => {
		el.dispatchEvent(event);
	});
	return event;
}

/** Drag from (x0,y0) to (x1,y1). The FIRST pointermove is consumed as an iOS baseline reset. */
async function drag(el: Element, x0: number, y0: number, x1: number, y1: number): Promise<void> {
	pointer(el, 'pointerdown', x0, y0);
	await settle();
	pointer(el, 'pointermove', x0, y0);
	await settle();
	pointer(el, 'pointermove', x1, y1, { x: x1 - x0, y: y1 - y0 });
	await settle();
	pointer(document, 'pointerup', x1, y1);
	await settle();
}

function toastCount(m: { container: HTMLElement }): number {
	return m.container.querySelectorAll('.toast-root').length;
}

describe('@octanejs/base-ui — Toast behavior', () => {
	it('adds, updates and closes through the imperative manager', async () => {
		const m = mount(ToastManaged);
		await settle();
		expect(toastCount(m)).toBe(0);

		const id = manager.add({ title: 'Saved', description: 'All good.' });
		await settle();
		expect(toastCount(m)).toBe(1);
		expect(m.find('.toast-title').textContent).toBe('Saved');
		expect(m.find('.toast-description').textContent).toBe('All good.');

		// The toast is labelled and described by its own parts.
		const root = m.find('.toast-root');
		expect(root.getAttribute('aria-labelledby')).toBe(m.find('.toast-title').id);
		expect(root.getAttribute('aria-describedby')).toBe(m.find('.toast-description').id);

		manager.update(id, { title: 'Updated' });
		await settle();
		expect(m.find('.toast-title').textContent).toBe('Updated');

		manager.close(id);
		await settleUntil(() => toastCount(m) === 0);
		expect(toastCount(m)).toBe(0);

		m.unmount();
	});

	it('adding a toast with an existing id updates it in place instead of stacking', async () => {
		const m = mount(ToastManaged);
		await settle();

		manager.add({ id: 'pinned', title: 'First' });
		await settle();
		expect(toastCount(m)).toBe(1);

		manager.add({ id: 'pinned', title: 'Second' });
		await settle();
		expect(toastCount(m)).toBe(1);
		expect(m.find('.toast-title').textContent).toBe('Second');

		manager.close('pinned');
		await settleUntil(() => toastCount(m) === 0);

		m.unmount();
	});

	it('closing runs onClose, and removal after the transition runs onRemove', async () => {
		const m = mount(ToastManaged);
		await settle();

		const calls: string[] = [];
		const id = manager.add({
			title: 'Bye',
			onClose: () => calls.push('close'),
			onRemove: () => calls.push('remove'),
		});
		await settle();
		expect(calls).toEqual([]);

		manager.close(id);
		await settleUntil(() => calls.length > 1);

		// Two distinct callbacks in order: `onClose` when the dismissal starts, `onRemove` once the
		// toast actually leaves the list. NOT asserted as separate steps — the gap between them is
		// the exit ANIMATION, and jsdom runs none, so `useOpenChangeComplete` resolves in the same
		// flush. Ordering and both firing exactly once is what is deterministic here.
		expect(calls).toEqual(['close', 'remove']);
		expect(toastCount(m)).toBe(0);

		m.unmount();
	});

	it('auto-dismisses after its timeout', async () => {
		const m = mount(ToastAutoDismiss);
		await settle();

		manager.add({ title: 'Transient' });
		await settle();
		expect(toastCount(m)).toBe(1);

		await settleUntil(() => toastCount(m) === 0);
		expect(toastCount(m)).toBe(0);

		m.unmount();
	});

	it('pauses the dismiss timer while the viewport is hovered', async () => {
		const m = mount(ToastAutoDismiss);
		await settle();

		manager.add({ title: 'Sticky while hovered' });
		await settle();

		const viewport = m.find('.toast-viewport');
		flushSync(() => {
			viewport.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
		});
		await settle();
		// Hovering expands the viewport and pauses every running timer.
		expect(viewport.hasAttribute('data-expanded')).toBe(true);

		// Well past the 60ms timeout — it must still be there.
		await new Promise((res) => setTimeout(res, 250));
		await settle();
		expect(toastCount(m)).toBe(1);

		// Leaving resumes the timer and it dismisses as normal.
		flushSync(() => {
			viewport.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
		});
		await settleUntil(() => toastCount(m) === 0);
		expect(toastCount(m)).toBe(0);

		m.unmount();
	});

	it('a loading toast never auto-dismisses, and the promise helper resolves it', async () => {
		const m = mount(ToastAutoDismiss);
		await settle();

		let resolvePromise: (value: string) => void = () => {};
		const pending = new Promise<string>((resolve) => {
			resolvePromise = resolve;
		});

		const handled = manager.promise(pending, {
			loading: 'Working…',
			success: (result: string) => `Done: ${result}`,
			error: 'Failed',
		});
		await settle();
		expect(m.find('.toast-description').textContent).toBe('Working…');

		// `type: 'loading'` opts out of the timer entirely, so it survives the timeout.
		await new Promise((res) => setTimeout(res, 250));
		await settle();
		expect(toastCount(m)).toBe(1);

		resolvePromise('saved');
		await handled;
		await settle();
		expect(m.find('.toast-description').textContent).toBe('Done: saved');

		await settleUntil(() => toastCount(m) === 0);

		m.unmount();
	});

	it('marks toasts beyond the limit as limited and inert, without removing them', async () => {
		const m = mount(ToastLimitOne);
		await settle();

		manager.add({ id: 'a', title: 'First' });
		await settle();
		expect(m.findAll('.toast-root').length).toBe(1);
		expect(m.find('.toast-root').hasAttribute('data-limited')).toBe(false);

		manager.add({ id: 'b', title: 'Second' });
		await settle();

		// Both are still in the DOM — the older one is flagged, not dropped, so it can animate out.
		const roots = m.findAll('.toast-root');
		expect(roots.length).toBe(2);
		const limited = roots.filter((el) => el.hasAttribute('data-limited'));
		expect(limited.length).toBe(1);
		expect(limited[0].hasAttribute('inert')).toBe(true);
		// Newest first, so the limited one is the older toast at the end.
		expect(limited[0].textContent).toContain('First');

		manager.close();
		await settleUntil(() => toastCount(m) === 0);

		m.unmount();
	});

	it('swiping past the threshold dismisses the toast', async () => {
		const m = mount(ToastManaged);
		await settle();

		manager.add({ title: 'Swipe me away' });
		await settle();
		expect(toastCount(m)).toBe(1);

		// `swipeDirection` defaults to ['down', 'right']; 100px right clears the 40px threshold.
		await drag(m.find('.toast-root'), 100, 100, 200, 100);
		await settleUntil(() => toastCount(m) === 0);
		expect(toastCount(m)).toBe(0);

		m.unmount();
	});

	it('tracks the swipe direction and movement while dragging, and springs back below the threshold', async () => {
		const m = mount(ToastManaged);
		await settle();

		manager.add({ title: 'Swipe me back' });
		await settle();
		const root = m.find('.toast-root') as HTMLElement;

		pointer(root, 'pointerdown', 100, 100);
		await settle();
		expect(root.hasAttribute('data-swiping')).toBe(true);

		pointer(root, 'pointermove', 100, 100);
		await settle();
		pointer(root, 'pointermove', 120, 100, { x: 20, y: 0 });
		await settle();

		// Direction is locked and the movement is published as a CSS variable for the animation.
		expect(root.getAttribute('data-swipe-direction')).toBe('right');
		expect(root.style.getPropertyValue('--toast-swipe-movement-x')).toBe('20px');

		// 20px is under the 40px threshold, so releasing springs it back instead of dismissing.
		pointer(document, 'pointerup', 120, 100);
		await settle();
		expect(toastCount(m)).toBe(1);
		expect(m.find('.toast-root').hasAttribute('data-swiping')).toBe(false);
		expect(m.find('.toast-root').getAttribute('data-swipe-direction')).toBe(null);

		manager.close();
		await settleUntil(() => toastCount(m) === 0);
		m.unmount();
	});

	it('does not start a swipe from an interactive element inside the toast', async () => {
		const m = mount(ToastManaged);
		await settle();

		manager.add({ title: 'Has a close button' });
		await settle();

		// A drag beginning on the close button must not swipe the toast — otherwise buttons would
		// be unusable on touch.
		await drag(m.find('.toast-close'), 100, 100, 200, 100);
		expect(toastCount(m)).toBe(1);

		manager.close();
		await settleUntil(() => toastCount(m) === 0);
		m.unmount();
	});

	it('the close button dismisses its own toast', async () => {
		const m = mount(ToastManaged);
		await settle();

		manager.add({ title: 'Closable' });
		await settle();
		expect(toastCount(m)).toBe(1);

		m.click('.toast-close');
		await settleUntil(() => toastCount(m) === 0);
		expect(toastCount(m)).toBe(0);

		m.unmount();
	});
});
