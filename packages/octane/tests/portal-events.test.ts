import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from './_helpers';
import { createRoot, createElement, createPortal, flushSync } from '../src/index.js';
import {
	BasicPortalClick,
	CrossPortalBubble,
	NonBubblingPortal,
	StopPropagation,
	TwoPortalsSameTarget,
	TogglePortal,
} from './_fixtures/portal-events.tsrx';

// Each test allocates its own portal target attached to document.body, so the
// octane event-delegation listeners are scoped to that target (matching
// React-17-shape behaviour).
let portalTarget: HTMLElement;

beforeEach(() => {
	portalTarget = document.createElement('section');
	portalTarget.id = 'portal-target';
	document.body.appendChild(portalTarget);
});

afterEach(() => {
	portalTarget.remove();
});

function clickIn(target: ParentNode, selector: string): void {
	const el = target.querySelector(selector) as HTMLElement | null;
	if (!el) throw new Error(`no element matching ${selector}`);
	flushSync(() => el.click());
}

describe('portal — event delegation', () => {
	it('retains the logical route when the last portal is removed after native capture', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		// This independent root keeps the native listener on the shared target
		// alive after the last portal unmounts during the event's target phase.
		const targetRoot = createRoot(portalTarget);
		const log: string[] = [];
		const render = (show: boolean) =>
			createElement(
				'section',
				{
					onClickCapture: () => log.push('capture'),
					onClick: () => log.push('parent'),
				},
				show
					? createPortal(
							createElement(
								'button',
								{
									onClick: () => log.push('target'),
								},
								'portal',
							),
							portalTarget,
						)
					: null,
			);
		try {
			flushSync(() => root.render(render(true)));
			const button = portalTarget.querySelector('button')!;
			button.addEventListener(
				'click',
				() => {
					log.push('native target');
					flushSync(() => root.render(render(false)));
				},
				{ once: true },
			);
			button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(log).toEqual(['capture', 'native target', 'target', 'parent']);
			expect(portalTarget.querySelector('button')).toBe(null);
		} finally {
			root.unmount();
			targetRoot.unmount();
			container.remove();
		}
	});

	it('fires click handlers attached INSIDE the portal contents', () => {
		const r = mount(BasicPortalClick, { target: portalTarget });
		expect(r.find('.count').textContent).toBe('0');

		clickIn(portalTarget, '.inside-btn');
		expect(r.find('.count').textContent).toBe('1');

		clickIn(portalTarget, '.inside-btn');
		clickIn(portalTarget, '.inside-btn');
		expect(r.find('.count').textContent).toBe('3');

		r.unmount();
	});

	it('bubbles events OUT of the portal to a handler on the React parent', () => {
		const r = mount(CrossPortalBubble, { target: portalTarget });
		expect(r.find('.inner-count').textContent).toBe('0');
		expect(r.find('.outer-count').textContent).toBe('0');

		// One click on the inner button should fire BOTH the inner button's
		// handler AND the outer div's handler — that's the whole point of the
		// $$portalParent jump: bubble continues up the React tree, not just the
		// portal target's DOM ancestors.
		clickIn(portalTarget, '.inside-btn');
		expect(r.find('.inner-count').textContent).toBe('1');
		expect(r.find('.outer-count').textContent).toBe('1');

		clickIn(portalTarget, '.inside-btn');
		expect(r.find('.inner-count').textContent).toBe('2');
		expect(r.find('.outer-count').textContent).toBe('2');

		r.unmount();
	});

	it('propagates non-bubbling events through the logical portal tree', () => {
		const log: string[] = [];
		const r = mount(NonBubblingPortal, { target: portalTarget, log: (s: string) => log.push(s) });

		portalTarget
			.querySelector('.inside-video')!
			.dispatchEvent(new Event('play', { bubbles: false }));
		expect(log).toEqual(['inner', 'outer']);

		r.unmount();
	});

	it('respects stopPropagation — outer handler does not fire when inner cancels bubbling', () => {
		const r = mount(StopPropagation, { target: portalTarget });

		clickIn(portalTarget, '.inside-btn');
		expect(r.find('.inner-count').textContent).toBe('1');
		expect(r.find('.outer-count').textContent).toBe('0');

		r.unmount();
	});

	it('two portals into the same target — both inner handlers fire independently', () => {
		const r = mount(TwoPortalsSameTarget, { target: portalTarget });
		expect(r.find('.a-count').textContent).toBe('0');
		expect(r.find('.b-count').textContent).toBe('0');

		clickIn(portalTarget, '.btn-a');
		expect(r.find('.a-count').textContent).toBe('1');
		expect(r.find('.b-count').textContent).toBe('0');

		clickIn(portalTarget, '.btn-b');
		clickIn(portalTarget, '.btn-b');
		expect(r.find('.a-count').textContent).toBe('1');
		expect(r.find('.b-count').textContent).toBe('2');

		r.unmount();
	});

	it('unmounting a portal detaches the listener (no orphaned dispatch)', () => {
		const r = mount(TogglePortal, { target: portalTarget });

		// Capture the inside-btn before we unmount — once toggled off, the DOM
		// is gone from portalTarget. We want to verify that REMOVING the portal
		// cleans up the listener; the easiest signal is "the second mount of the
		// portal doesn't end up with double listeners firing twice."
		expect(portalTarget.querySelector('.inside-btn')).not.toBe(null);

		r.click('.toggle'); // close: portal unmounts, listener detached
		expect(portalTarget.querySelector('.inside-btn')).toBe(null);

		r.click('.toggle'); // reopen: portal remounts, listener re-attached
		expect(portalTarget.querySelector('.inside-btn')).not.toBe(null);

		// After remount, the inside-btn has no click handler stamped in this
		// fixture — we're really verifying that no exception is thrown by a
		// stale dispatch path (e.g. iterating handlers on the now-detached old
		// portal block). The smoke test here is just that mount/unmount cycle
		// works cleanly across the delegation register/unregister boundary.
		clickIn(portalTarget, '.inside-btn');

		r.unmount();
	});

	it('releases a shared target’s native subscriptions when its last portal unmounts', () => {
		let nativeClicks = 0;
		const nativeClick = () => nativeClicks++;
		portalTarget.addEventListener('click', nativeClick);
		const attached = vi.spyOn(portalTarget, 'addEventListener');
		const detached = vi.spyOn(portalTarget, 'removeEventListener');
		const first = mount(BasicPortalClick, { target: portalTarget });
		const second = mount(BasicPortalClick, { target: portalTarget });
		const clicks = attached.mock.calls.filter(([type]) => type === 'click');
		const released = ([type, listener, options]: (typeof clicks)[number]) => {
			const capture = typeof options === 'boolean' ? options : (options?.capture ?? false);
			return detached.mock.calls.some(([removedType, removedListener, removedOptions]) => {
				const removedCapture =
					typeof removedOptions === 'boolean' ? removedOptions : (removedOptions?.capture ?? false);
				return type === removedType && listener === removedListener && capture === removedCapture;
			});
		};
		try {
			expect(clicks.length).toBeGreaterThan(0);
			const button = portalTarget.querySelectorAll<HTMLButtonElement>('.inside-btn')[1];
			first.unmount();
			expect(clicks.some(released)).toBe(false);
			flushSync(() => button.click());
			expect(second.find('.count').textContent).toBe('1');
			expect(nativeClicks).toBe(1);
			second.unmount();
			expect(portalTarget.querySelector('.inside-btn')).toBeNull();
			// Match callback identity and capture mode without fixing registration
			// order or the number of listeners the delegation implementation uses.
			expect(clicks.every(released)).toBe(true);
			portalTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(nativeClicks).toBe(2);
		} finally {
			first.unmount();
			second.unmount();
			attached.mockRestore();
			detached.mockRestore();
			portalTarget.removeEventListener('click', nativeClick);
		}
	});
});
