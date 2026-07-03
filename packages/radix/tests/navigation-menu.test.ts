import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import {
	NavMenuViewportApp,
	NavMenuInlineApp,
	NavMenuSubApp,
} from './_fixtures/navigation-menu.tsx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

const wait = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

const inC =
	(container: HTMLElement) =>
	(sel: string): HTMLElement | null =>
		container.querySelector(sel);

function click(el: Element): void {
	flushSync(() => {
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	});
}

// The trigger opens from `pointermove` (whenMouse), with `pointerenter` first to reset
// the was-click-closed / was-escape-closed flags — dispatch both like a real hover.
function hover(el: Element): void {
	flushSync(() => {
		el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, pointerType: 'mouse' }));
		el.dispatchEvent(
			new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerType: 'mouse' }),
		);
	});
}

function pointerMove(el: Element): void {
	flushSync(() => {
		el.dispatchEvent(
			new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerType: 'mouse' }),
		);
	});
}

function pointerLeave(el: Element): void {
	flushSync(() => {
		el.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, pointerType: 'mouse' }));
	});
}

function keydown(el: Element | Document, key: string): void {
	flushSync(() => {
		el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
	});
}

describe('@octanejs/radix — NavigationMenu', () => {
	afterEach(async () => {
		await settle();
	});

	it('mounts a nav + list with the source aria wiring; closed trigger has no aria-controls', async () => {
		const r = mount(NavMenuInlineApp);
		const $ = inC(r.container);
		await settle();

		const root = $('[data-testid="root"]')!;
		expect(root.tagName).toBe('NAV');
		expect(root.getAttribute('aria-label')).toBe('Main');
		expect(root.getAttribute('data-orientation')).toBe('horizontal');
		expect(root.getAttribute('dir')).toBe('ltr');

		const list = $('[data-testid="list"]')!;
		expect(list.tagName).toBe('UL');
		expect(list.getAttribute('data-orientation')).toBe('horizontal');
		// The list is wrapped by the indicator track (position: relative div).
		expect((list.parentElement as HTMLElement).style.position).toBe('relative');

		const trigger = $('[data-testid="trigger-one"]')!;
		expect(trigger.tagName).toBe('BUTTON');
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.hasAttribute('aria-controls')).toBe(false);
		expect($('[data-testid="content-one"]')).toBe(null);
		r.unmount();
	});

	it('defaultValue renders open content in the viewport with the trigger/content id wiring', async () => {
		const r = mount(NavMenuViewportApp, { defaultValue: 'one' });
		const $ = inC(r.container);
		await settle();

		const trigger = $('[data-testid="trigger-one"]')!;
		expect(trigger.getAttribute('data-state')).toBe('open');
		expect(trigger.getAttribute('aria-expanded')).toBe('true');

		const content = $('[data-testid="content-one"]')!;
		expect(content).not.toBe(null);
		// Content is proxied INTO the viewport when one is rendered.
		const viewport = $('[data-testid="viewport"]')!;
		expect(viewport.contains(content)).toBe(true);
		expect(viewport.getAttribute('data-state')).toBe('open');
		expect(content.textContent).toContain('Content One');
		expect(content.getAttribute('data-orientation')).toBe('horizontal');

		// aria-controls references the real content id; aria-labelledby points back.
		const contentId = trigger.getAttribute('aria-controls')!;
		expect(contentId).toBeTruthy();
		expect(content.id).toBe(contentId);
		expect(content.getAttribute('aria-labelledby')).toBe(trigger.id);

		// a11y tree restructure: an aria-owns span accompanies the open trigger.
		expect($(`span[aria-owns="${contentId}"]`)).not.toBe(null);

		// The viewport measured the active content (jsdom: 0px) into its CSS vars.
		expect(viewport.style.getPropertyValue('--radix-navigation-menu-viewport-width')).toBe('0px');
		expect(viewport.style.getPropertyValue('--radix-navigation-menu-viewport-height')).toBe('0px');
		r.unmount();
	});

	it('pointer hover opens after delayDuration and closes ~150ms after pointer leave', async () => {
		const r = mount(NavMenuInlineApp);
		const $ = inC(r.container);
		await settle();
		const trigger = $('[data-testid="trigger-one"]')!;

		hover(trigger);
		await settle();
		// Not yet — the 100ms open delay hasn't elapsed.
		expect($('[data-testid="content-one"]')).toBe(null);
		await wait(150);
		await settle();
		const content = $('[data-testid="content-one"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('data-state')).toBe('open');
		expect(trigger.getAttribute('data-state')).toBe('open');

		pointerLeave(trigger);
		await settle();
		// Close intent is a fixed 150ms timer — still open immediately after leaving.
		expect($('[data-testid="content-one"]')).not.toBe(null);
		await wait(200);
		await settle();
		expect($('[data-testid="content-one"]')).toBe(null);
		expect(trigger.getAttribute('data-state')).toBe('closed');
		r.unmount();
	});

	it('click toggles; after a click-close pointermove alone does not reopen, a fresh hover does (skip delay)', async () => {
		const r = mount(NavMenuInlineApp);
		const $ = inC(r.container);
		await settle();
		const trigger = $('[data-testid="trigger-one"]')!;

		click(trigger);
		await settle();
		expect($('[data-testid="content-one"]')).not.toBe(null);
		expect(trigger.getAttribute('aria-expanded')).toBe('true');

		click(trigger);
		await settle();
		expect($('[data-testid="content-one"]')).toBe(null);
		expect(trigger.getAttribute('aria-expanded')).toBe('false');

		// wasClickClose: moving the pointer on the trigger without re-entering must not reopen.
		pointerMove(trigger);
		await wait(150);
		await settle();
		expect($('[data-testid="content-one"]')).toBe(null);

		// A fresh enter resets the flag; within skipDelayDuration the open is instant.
		hover(trigger);
		await settle();
		expect($('[data-testid="content-one"]')).not.toBe(null);
		r.unmount();
	});

	it('switching triggers computes data-motion from item order', async () => {
		const r = mount(NavMenuViewportApp);
		const $ = inC(r.container);
		await settle();

		click($('[data-testid="trigger-one"]')!);
		await settle();
		const contentOne = $('[data-testid="content-one"]')!;
		expect(contentOne).not.toBe(null);
		// Initial open has no direction.
		expect(contentOne.hasAttribute('data-motion')).toBe(false);

		click($('[data-testid="trigger-two"]')!);
		await settle();
		expect($('[data-testid="content-one"]')).toBe(null); // no exit animation in jsdom
		const contentTwo = $('[data-testid="content-two"]')!;
		expect(contentTwo).not.toBe(null);
		// Moving one → two (forwards): the incoming content enters from the end.
		expect(contentTwo.getAttribute('data-motion')).toBe('from-end');

		click($('[data-testid="trigger-one"]')!);
		await settle();
		// Moving two → one (backwards): enters from the start.
		expect($('[data-testid="content-one"]')!.getAttribute('data-motion')).toBe('from-start');
		r.unmount();
	});

	it('Escape closes, refocuses the trigger, and blocks pointermove reopen until re-enter', async () => {
		const r = mount(NavMenuInlineApp);
		const $ = inC(r.container);
		await settle();
		const trigger = $('[data-testid="trigger-one"]')!;

		click(trigger);
		await settle();
		expect($('[data-testid="content-one"]')).not.toBe(null);
		($('[data-testid="link-one"]') as HTMLElement).focus();
		await settle();

		keydown(document, 'Escape');
		await settle();
		expect($('[data-testid="content-one"]')).toBe(null);
		expect(trigger.getAttribute('data-state')).toBe('closed');
		// Focus returned from the content to its trigger.
		expect(document.activeElement).toBe(trigger);

		// wasEscapeClose: pointermove alone must not reopen…
		pointerMove(trigger);
		await wait(150);
		await settle();
		expect($('[data-testid="content-one"]')).toBe(null);

		// …but a fresh pointer enter resets the flag and opens again.
		hover(trigger);
		await wait(150);
		await settle();
		expect($('[data-testid="content-one"]')).not.toBe(null);
		r.unmount();
	});

	it('ArrowDown on an open trigger moves focus into the content (entry key)', async () => {
		const r = mount(NavMenuInlineApp);
		const $ = inC(r.container);
		await settle();
		const trigger = $('[data-testid="trigger-one"]') as HTMLElement;

		click(trigger);
		await settle();
		expect($('[data-testid="content-one"]')).not.toBe(null);
		trigger.focus();
		await settle();

		keydown(trigger, 'ArrowDown');
		await settle();
		expect(document.activeElement).toBe($('[data-testid="link-one"]'));
		r.unmount();
	});

	it('arrow keys move focus between triggers (FocusGroup) and link select closes the menu', async () => {
		const r = mount(NavMenuViewportApp);
		const $ = inC(r.container);
		await settle();
		const triggerOne = $('[data-testid="trigger-one"]') as HTMLElement;
		const triggerTwo = $('[data-testid="trigger-two"]') as HTMLElement;

		triggerOne.focus();
		keydown(triggerOne, 'ArrowRight');
		// Focus moves in a timeout (imperative focus during keydown is deferred).
		await wait(20);
		await settle();
		expect(document.activeElement).toBe(triggerTwo);

		keydown(triggerTwo, 'ArrowLeft');
		await wait(20);
		await settle();
		expect(document.activeElement).toBe(triggerOne);

		// Open item one and select its link: onSelect fires and the whole menu dismisses.
		click(triggerOne);
		await settle();
		expect($('[data-testid="content-one"]')).not.toBe(null);
		click($('[data-testid="link-one"]')!);
		await settle();
		expect($('[data-testid="selected"]')!.textContent).toBe('one');
		expect($('[data-testid="content-one"]')).toBe(null);
		expect(triggerOne.getAttribute('data-state')).toBe('closed');
		r.unmount();
	});

	it('Indicator portals into the indicator track, shows data-state visible while open, and unmounts on close', async () => {
		const r = mount(NavMenuViewportApp);
		const $ = inC(r.container);
		await settle();

		// Closed: Presence keeps the indicator unmounted.
		expect($('[data-testid="indicator"]')).toBe(null);

		click($('[data-testid="trigger-one"]')!);
		// `position` arrives via the ResizeObserver shim's 0-timeout — settle() waits past it.
		await settle();
		const indicator = $('[data-testid="indicator"]')!;
		expect(indicator).not.toBe(null);
		expect(indicator.getAttribute('data-state')).toBe('visible');
		expect(indicator.getAttribute('data-orientation')).toBe('horizontal');
		expect(indicator.getAttribute('aria-hidden')).toBe('true');
		// Portal'd into the indicator track: the `position: relative` div wrapping the list,
		// NOT the list itself (the Indicator sits inside List in the fixture).
		const list = $('[data-testid="list"]')!;
		const track = list.parentElement as HTMLElement;
		expect(track.style.position).toBe('relative');
		expect(indicator.parentElement).toBe(track);
		expect(list.contains(indicator)).toBe(false);
		// jsdom has no layout: the measured trigger size/offset are 0.
		expect(indicator.style.position).toBe('absolute');
		expect(indicator.style.width).toBe('0px');

		// Closing unmounts it again (no exit animation in jsdom).
		click($('[data-testid="trigger-one"]')!);
		await settle();
		expect($('[data-testid="indicator"]')).toBe(null);
		r.unmount();
	});

	it('Sub renders a nested menu inside root content with its own instant-open value state', async () => {
		const r = mount(NavMenuSubApp);
		const $ = inC(r.container);
		await settle();

		click($('[data-testid="trigger-one"]')!);
		await settle();
		const content = $('[data-testid="content-one"]')!;
		expect(content).not.toBe(null);

		const sub = $('[data-testid="sub"]')!;
		expect(sub).not.toBe(null);
		expect(sub.tagName).toBe('DIV');
		expect(sub.getAttribute('data-orientation')).toBe('horizontal');
		expect(content.contains(sub)).toBe(true);
		// Sub menu starts closed.
		expect($('[data-testid="sub-content"]')).toBe(null);
		const subTrigger = $('[data-testid="sub-trigger"]')!;
		expect(subTrigger.getAttribute('data-state')).toBe('closed');

		// Sub opens instantly on select (no delay timers).
		click(subTrigger);
		await settle();
		expect($('[data-testid="sub-content"]')).not.toBe(null);
		expect(subTrigger.getAttribute('data-state')).toBe('open');
		expect($('[data-testid="sub-content"]')!.textContent).toContain('Sub Content One');
		// Root content stays open while the sub menu operates.
		expect($('[data-testid="content-one"]')).not.toBe(null);

		// Unlike Root, Sub's onItemSelect does NOT toggle (source: navigation-menu.tsx:263
		// `onItemSelect={(itemValue) => setValue(itemValue)}`) — a second click keeps it open.
		click(subTrigger);
		await settle();
		expect($('[data-testid="sub-content"]')).not.toBe(null);
		expect(subTrigger.getAttribute('data-state')).toBe('open');
		r.unmount();
	});
});
