import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { ToastApp } from './_fixtures/toast.tsx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

async function wait(ms: number): Promise<void> {
	await new Promise((res) => setTimeout(res, ms));
	await settle();
}

const inC =
	(container: HTMLElement) =>
	(sel: string): HTMLElement | null =>
		container.querySelector(sel);

function click(el: Element): void {
	flushSync(() => {
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	});
}

function dispatch(el: EventTarget, event: Event): void {
	flushSync(() => {
		el.dispatchEvent(event);
	});
}

describe('@octanejs/radix — Toast', () => {
	afterEach(async () => {
		await settle();
	});

	it('mounts with the region/list a11y wiring and an open toast in the viewport', async () => {
		const r = mount(ToastApp, { duration: 60_000 });
		const $ = inC(r.container);
		await settle();

		// Viewport wrapper: role=region with the hotkey templated into the label.
		const region = $('[role="region"]')!;
		expect(region).not.toBe(null);
		expect(region.getAttribute('aria-label')).toBe('Notifications (F8)');
		expect(region.getAttribute('tabindex')).toBe('-1');

		// The ol list carries the viewport testid and tabIndex -1.
		const viewport = $('[data-testid="viewport"]')!;
		expect(viewport.tagName).toBe('OL');
		expect(viewport.getAttribute('tabindex')).toBe('-1');
		expect(region.contains(viewport)).toBe(true);

		// The toast is portalled INTO the viewport as an li.
		const toast = $('[data-testid="toast"]')!;
		expect(toast.tagName).toBe('LI');
		expect(viewport.contains(toast)).toBe(true);
		expect(toast.getAttribute('data-state')).toBe('open');
		expect(toast.getAttribute('data-swipe-direction')).toBe('right');
		expect(toast.getAttribute('tabindex')).toBe('0');
		expect($('[data-testid="title"]')!.textContent).toBe('Saved!');
		expect($('[data-testid="description"]')!.textContent).toBe('Your changes were saved.');

		// Close is a type=button marked as announce-excluded.
		const close = $('[data-testid="close"]')!;
		expect(close.tagName).toBe('BUTTON');
		expect(close.getAttribute('type')).toBe('button');
		expect(close.hasAttribute('data-radix-toast-announce-exclude')).toBe(true);
		r.unmount();
	});

	it('auto-dismisses after its duration and reports onOpenChange(false)', async () => {
		const r = mount(ToastApp, { duration: 50 });
		const $ = inC(r.container);
		await settle();
		expect($('[data-testid="toast"]')).not.toBe(null);
		expect($('[data-testid="status"]')!.textContent).toBe('open');

		await wait(150);
		expect($('[data-testid="toast"]')).toBe(null);
		expect($('[data-testid="status"]')!.textContent).toBe('closed');
		r.unmount();
	});

	it('pointermove over the viewport pauses the close timer; pointerleave resumes it', async () => {
		const r = mount(ToastApp, { duration: 150 });
		const $ = inC(r.container);
		await settle();
		const region = $('[role="region"]')!;
		expect($('[data-testid="toast"]')).not.toBe(null);

		// Hovering the viewport wrapper dispatches toast.viewportPause → timer stops.
		dispatch(region, new Event('pointermove', { bubbles: true }));
		await wait(400); // well past the 150ms duration
		expect($('[data-testid="toast"]')).not.toBe(null);
		expect($('[data-testid="status"]')!.textContent).toBe('open');

		// Leaving the viewport resumes with the remaining time.
		dispatch(region, new Event('pointerleave'));
		await wait(400);
		expect($('[data-testid="toast"]')).toBe(null);
		expect($('[data-testid="status"]')!.textContent).toBe('closed');
		r.unmount();
	});

	it('F8 (the default hotkey, matched via event.code) focuses the viewport list', async () => {
		const r = mount(ToastApp, { duration: 60_000 });
		const $ = inC(r.container);
		await settle();
		const viewport = $('[data-testid="viewport"]')!;
		expect(document.activeElement).not.toBe(viewport);

		dispatch(document, new KeyboardEvent('keydown', { code: 'F8', bubbles: true }));
		await settle();
		expect(document.activeElement).toBe(viewport);
		r.unmount();
	});

	it('the Close button closes the toast', async () => {
		const r = mount(ToastApp, { duration: 60_000 });
		const $ = inC(r.container);
		await settle();
		expect($('[data-testid="toast"]')).not.toBe(null);

		click($('[data-testid="close"]')!);
		await settle();
		expect($('[data-testid="toast"]')).toBe(null);
		expect($('[data-testid="status"]')!.textContent).toBe('closed');
		r.unmount();
	});

	it('Escape closes the toast (DismissableLayer escape path)', async () => {
		const r = mount(ToastApp, { duration: 60_000 });
		const $ = inC(r.container);
		await settle();
		const toast = $('[data-testid="toast"]')!;

		dispatch(
			toast,
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
		);
		await settle();
		expect($('[data-testid="toast"]')).toBe(null);
		expect($('[data-testid="status"]')!.textContent).toBe('closed');
		r.unmount();
	});

	it('Action requires altText: renders (announce-excluded, with alt) when given, not otherwise', async () => {
		const r = mount(ToastApp, { duration: 60_000, withAction: true });
		const $ = inC(r.container);
		await settle();
		const action = $('[data-testid="action"]')!;
		expect(action).not.toBe(null);
		expect(action.tagName).toBe('BUTTON');
		expect(action.hasAttribute('data-radix-toast-announce-exclude')).toBe(true);
		expect(action.getAttribute('data-radix-toast-announce-alt')).toBe('Undo the save');
		r.unmount();

		// Empty altText → the Action renders nothing (functional part of the source's
		// dev error; the console.error itself is not ported).
		const r2 = mount(ToastApp, { duration: 60_000, withAction: true, actionAltText: '' });
		const $2 = inC(r2.container);
		await settle();
		expect($2('[data-testid="action"]')).toBe(null);
		expect($2('[data-testid="toast"]')).not.toBe(null); // toast itself still renders
		r2.unmount();
	});

	it('renders a VisuallyHidden live region announcing label + text content (alt text for actions), then cleans it up', async () => {
		const r = mount(ToastApp, { duration: 60_000, withAction: true });
		const $ = inC(r.container);
		await settle();
		const announcer = $('[data-testid="announcer"]')!;

		// The live region exists immediately with the right politeness wiring…
		const liveRegion = announcer.querySelector('[role="status"]')! as HTMLElement;
		expect(liveRegion).not.toBe(null);
		expect(liveRegion.getAttribute('aria-live')).toBe('assertive');

		// …and its text renders on the next frame (double rAF).
		await wait(100);
		const announced = announcer.querySelector('[role="status"]')!.textContent!;
		expect(announced).toContain('Notification');
		expect(announced).toContain('Saved!');
		expect(announced).toContain('Your changes were saved.');
		// The Action contributes its altText, not its label; Close (no alt) is excluded.
		expect(announced).toContain('Undo the save');
		expect(announced).not.toContain('Dismiss');

		// After the 1s announce window the region is removed.
		await wait(1100);
		expect(announcer.querySelector('[role="status"]')).toBe(null);
		r.unmount();
	});
});
