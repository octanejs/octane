import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { SelectApp, ItemAlignedSelectApp } from './_fixtures/select.tsx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

const inC =
	(container: HTMLElement) =>
	(sel: string): HTMLElement | null =>
		container.querySelector(sel);

// Content portals into document.body (documented exception to container-scoped
// queries — same as tooltip.test.ts): content-side assertions query the document.
const inBody = (sel: string): HTMLElement | null => document.querySelector(sel);

// The trigger opens on pointerdown ONLY for a real mouse pointer (left button, no
// ctrl). jsdom's PointerEvent supports `pointerType`/`button` in its init dict.
function pressTrigger(trigger: Element): void {
	flushSync(() => {
		trigger.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				cancelable: true,
				button: 0,
				pointerType: 'mouse',
			}),
		);
	});
}

// Items select on `click` when the pointer type isn't mouse (the default), which is
// exactly what a bare click dispatch models.
function clickItem(item: Element): void {
	flushSync(() => {
		item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	});
}

function keydown(target: Element | Document, key: string): void {
	flushSync(() => {
		target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
	});
}

describe('@octanejs/radix — Select', () => {
	afterEach(async () => {
		await settle();
	});

	it('closed mount: combobox aria wiring, placeholder, and the hidden native select carrying the item options', async () => {
		const r = mount(SelectApp);
		const $ = inC(r.container);
		await settle();

		const trigger = $('[data-testid="trigger"]')!;
		expect(trigger.getAttribute('role')).toBe('combobox');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		// Per select.test.tsx "should not reference a non-existent element while closed".
		expect(trigger.getAttribute('aria-controls')).toBe(null);
		expect(trigger.getAttribute('aria-autocomplete')).toBe('none');
		expect(trigger.getAttribute('data-state')).toBe('closed');
		// No value yet → placeholder marker + placeholder text in the value node.
		expect(trigger.hasAttribute('data-placeholder')).toBe(true);
		expect($('[data-testid="trigger-value"]')!.textContent).toBe('Pick a fruit');
		// Content is not rendered anywhere while closed.
		expect(inBody('[role="listbox"]')).toBe(null);
		expect(inBody('[data-testid="content"]')).toBe(null);

		// The hidden native select engages inside the form; items keep rendering in a
		// detached fragment while closed, so their native options are registered.
		const form = $('[data-testid="form"]') as HTMLFormElement;
		const nativeSelect = form.querySelector('select')!;
		expect(nativeSelect).not.toBe(null);
		expect(nativeSelect.getAttribute('aria-hidden')).toBe('true');
		expect(nativeSelect.name).toBe('fruit');
		expect(nativeSelect.tabIndex).toBe(-1);
		const optionValues = Array.from(nativeSelect.querySelectorAll('option')).map((o) => o.value);
		expect(optionValues).toContain('apple');
		expect(optionValues).toContain('banana');
		expect(optionValues).toContain('cherry');
		expect(optionValues).toContain('durian');
		// The synthetic empty placeholder option exists exactly once and is selected.
		expect(optionValues.filter((v) => v === '').length).toBe(1);
		expect(new FormData(form).get('fruit')).toBe('');
		r.unmount();
	});

	it('defaultValue renders the selected item text into the trigger while closed and seeds FormData', async () => {
		const r = mount(SelectApp, { defaultValue: 'banana' });
		const $ = inC(r.container);
		await settle();

		const trigger = $('[data-testid="trigger"]')!;
		expect(trigger.hasAttribute('data-placeholder')).toBe(false);
		// ItemText portals the label from the detached fragment into the value node.
		expect($('[data-testid="trigger-value"]')!.textContent).toBe('Banana');
		const form = $('[data-testid="form"]') as HTMLFormElement;
		expect(new FormData(form).get('fruit')).toBe('banana');
		r.unmount();
	});

	it('opens on mouse pointerdown with role=listbox content, option items, and focus on the selected item', async () => {
		const r = mount(SelectApp, { defaultValue: 'banana' });
		const $ = inC(r.container);
		await settle();

		const trigger = $('[data-testid="trigger"]')!;
		pressTrigger(trigger);
		await settle();

		const content = inBody('[data-testid="content"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('role')).toBe('listbox');
		expect(content.getAttribute('data-state')).toBe('open');
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(trigger.getAttribute('data-state')).toBe('open');
		// Per select.test.tsx "should reference the rendered content while open".
		expect(content.id).toBeTruthy();
		expect(trigger.getAttribute('aria-controls')).toBe(content.id);
		// Popper-positioned in a portal.
		expect(content.closest('[data-radix-popper-content-wrapper]')).not.toBe(null);
		// Items carry option roles + state.
		const banana = inBody('[data-testid="item-banana"]')!;
		expect(banana.getAttribute('role')).toBe('option');
		expect(banana.getAttribute('data-state')).toBe('checked');
		expect(inBody('[data-testid="item-apple"]')!.getAttribute('data-state')).toBe('unchecked');
		expect(inBody('[data-testid="item-durian"]')!.getAttribute('aria-disabled')).toBe('true');
		// Selected item shows its indicator; unselected does not.
		expect(inBody('[data-testid="indicator-banana"]')).not.toBe(null);
		expect(inBody('[data-testid="indicator-apple"]')).toBe(null);
		// Once positioned, focus lands on the selected item.
		expect(document.activeElement).toBe(banana);
		r.unmount();
	});

	it('click selects an item: value in trigger, closes, fires onValueChange, syncs FormData and bubbles form change', async () => {
		const r = mount(SelectApp);
		const $ = inC(r.container);
		await settle();

		const trigger = $('[data-testid="trigger"]')!;
		pressTrigger(trigger);
		await settle();
		expect(inBody('[data-testid="content"]')).not.toBe(null);

		clickItem(inBody('[data-testid="item-cherry"]')!);
		await settle();

		// Closed again, focus returned to the trigger.
		expect(inBody('[data-testid="content"]')).toBe(null);
		expect(document.activeElement).toBe(trigger);
		// onValueChange observed by the app.
		expect($('[data-testid="value"]')!.textContent).toBe('cherry');
		// The selected label portals into the trigger's value node.
		expect($('[data-testid="trigger-value"]')!.textContent).toBe('Cherry');
		expect(trigger.hasAttribute('data-placeholder')).toBe(false);
		// The hidden native select synced via the native value setter + dispatched a
		// bubbling change the form observed.
		const form = $('[data-testid="form"]') as HTMLFormElement;
		expect(new FormData(form).get('fruit')).toBe('cherry');
		expect(Number($('[data-testid="changes"]')!.textContent)).toBeGreaterThanOrEqual(1);

		// A disabled item cannot be selected.
		pressTrigger(trigger);
		await settle();
		clickItem(inBody('[data-testid="item-durian"]')!);
		await settle();
		expect($('[data-testid="value"]')!.textContent).toBe('cherry');
		expect(inBody('[data-testid="content"]')).not.toBe(null); // still open
		r.unmount();
	});

	it('keyboard: ArrowDown opens, typeahead focuses the match, Enter selects it', async () => {
		const r = mount(SelectApp, { defaultValue: 'apple' });
		const $ = inC(r.container);
		await settle();

		const trigger = $('[data-testid="trigger"]')!;
		keydown(trigger, 'ArrowDown');
		await settle();
		expect(inBody('[data-testid="content"]')).not.toBe(null);
		expect(document.activeElement).toBe(inBody('[data-testid="item-apple"]'));

		// Typeahead inside the content: "b" focuses Banana (deferred via setTimeout).
		keydown(document.activeElement!, 'b');
		await new Promise((res) => setTimeout(res, 10));
		await settle();
		const banana = inBody('[data-testid="item-banana"]')!;
		expect(document.activeElement).toBe(banana);

		// Enter selects the focused item and closes.
		keydown(banana, 'Enter');
		await settle();
		expect(inBody('[data-testid="content"]')).toBe(null);
		expect($('[data-testid="value"]')!.textContent).toBe('banana');
		expect($('[data-testid="trigger-value"]')!.textContent).toBe('Banana');
		r.unmount();
	});

	it('typeahead on the closed trigger changes the value without opening', async () => {
		const r = mount(SelectApp);
		const $ = inC(r.container);
		await settle();

		const trigger = $('[data-testid="trigger"]')!;
		keydown(trigger, 'c');
		await settle();

		expect(inBody('[data-testid="content"]')).toBe(null); // still closed
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect($('[data-testid="value"]')!.textContent).toBe('cherry');
		expect($('[data-testid="trigger-value"]')!.textContent).toBe('Cherry');
		r.unmount();
	});

	it('Escape closes via the dismissable layer and returns focus to the trigger', async () => {
		const r = mount(SelectApp, { defaultValue: 'apple' });
		const $ = inC(r.container);
		await settle();

		const trigger = $('[data-testid="trigger"]')!;
		pressTrigger(trigger);
		await settle();
		expect(inBody('[data-testid="content"]')).not.toBe(null);

		keydown(document, 'Escape');
		await settle();
		expect(inBody('[data-testid="content"]')).toBe(null);
		expect(document.activeElement).toBe(trigger);
		// Value unchanged by dismissal.
		expect($('[data-testid="value"]')!.textContent).toBe('apple');
		r.unmount();
	});

	it('item-aligned (default) position mounts on zero rects, focuses the selection, and selects on click', async () => {
		const r = mount(ItemAlignedSelectApp);
		const $ = inC(r.container);
		await settle();

		const trigger = $('[data-testid="trigger"]')!;
		expect($('[data-testid="trigger-value"]')!.textContent).toBe('Bravo');

		pressTrigger(trigger);
		await settle();
		const content = inBody('[data-testid="content"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('role')).toBe('listbox');
		// The item-aligned wrapper (position:fixed flex column) hosts the content.
		const wrapper = content.parentElement!;
		expect(wrapper.style.position).toBe('fixed');
		// Zero-size math ran without throwing and placed the content → selection focused.
		expect(document.activeElement).toBe(inBody('[data-testid="item-b"]'));
		// Scroll buttons stay unmounted (nothing to scroll in jsdom's zero layout).
		expect(inBody('[data-testid="scroll-up"]')).toBe(null);
		expect(inBody('[data-testid="scroll-down"]')).toBe(null);

		clickItem(inBody('[data-testid="item-c"]')!);
		await settle();
		expect(inBody('[data-testid="content"]')).toBe(null);
		expect($('[data-testid="value"]')!.textContent).toBe('c');
		expect($('[data-testid="trigger-value"]')!.textContent).toBe('Charlie');
		r.unmount();
	});

	it("viewport scroll fires the consumer's onScroll (native scroll doesn't bubble — the port attaches a direct listener)", async () => {
		const r = mount(SelectApp);
		const $ = inC(r.container);
		await settle();

		pressTrigger($('[data-testid="trigger"]')!);
		await settle();
		const viewport = inBody('[data-testid="viewport"]')!;
		expect(viewport).not.toBe(null);
		expect(Number($('[data-testid="scrolls"]')!.textContent)).toBe(0);

		// `scroll` is non-bubbling; a delegated-from-the-root `onScroll` prop would
		// never see this dispatch. The Viewport must have attached a real listener.
		flushSync(() => {
			viewport.dispatchEvent(new Event('scroll'));
		});
		await settle();
		expect(Number($('[data-testid="scrolls"]')!.textContent)).toBe(1);

		flushSync(() => {
			viewport.dispatchEvent(new Event('scroll'));
		});
		await settle();
		expect(Number($('[data-testid="scrolls"]')!.textContent)).toBe(2);
		r.unmount();
	});
});
