import { describe, expect, it, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import {
	AlertDialogFixture,
	DialogFixture,
	DialogNoCloseFixture,
	HoverCardFixture,
	PopoverFixture,
	PopoverWithAnchorFixture,
	SheetFixture,
	TooltipFixture,
} from './_fixtures/overlays-app.tsrx';

// Overlay parts portal into document.body, so queries go through `document`.
const $ = (sel: string): HTMLElement | null => document.querySelector(sel);
const $$ = (sel: string): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(sel));

// Drain passive effects + let macrotask-deferred setup (document listeners,
// layer-stack re-render, FocusScope's unmount setTimeout) run, a few rounds —
// the pattern from packages/radix/tests.
async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

// jsdom's .click() emits only `click` — the DismissableLayer listens for
// pointerdown, so emit the full sequence like a real pointer press.
function press(el: Element | Document, opts: PointerEventInit = {}): void {
	flushSync(() => {
		el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ...opts }));
		el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, ...opts }));
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...opts }));
	});
}

function pressEscape(): void {
	flushSync(() => {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	});
}

describe('@octanejs/shadcn — Dialog', () => {
	afterEach(async () => {
		await settle();
	});

	it('closed by default: trigger contract, no portaled content', async () => {
		const r = mount(DialogFixture);
		await settle();
		const trigger = $('[data-testid="dialog-trigger"]')!;
		expect(trigger.getAttribute('data-slot')).toBe('dialog-trigger');
		expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect($('[data-slot="dialog-content"]')).toBe(null);
		expect($('[data-slot="dialog-overlay"]')).toBe(null);
		r.unmount();
	});

	it('open: overlay + content portal to body with the class/aria/slot contract', async () => {
		const r = mount(DialogFixture);
		await settle();
		r.click('[data-testid="dialog-trigger"]');
		await settle();

		const content = $('[data-slot="dialog-content"]')!;
		const overlay = $('[data-slot="dialog-overlay"]')!;
		expect(content).not.toBe(null);
		expect(r.container.contains(content)).toBe(false);
		expect(document.body.contains(content)).toBe(true);
		expect(content.className).toContain('bg-popover');
		expect(content.className).toContain('extra-content');
		expect(content.getAttribute('role')).toBe('dialog');
		expect(content.getAttribute('data-state')).toBe('open');
		expect(overlay.className).toContain('fixed inset-0');
		expect(overlay.getAttribute('data-state')).toBe('open');

		// Title/description ids are wired to the content's ARIA.
		const title = $('[data-slot="dialog-title"]')!;
		const desc = $('[data-slot="dialog-description"]')!;
		expect(title.className).toContain('leading-none');
		expect(title.className).toContain('cn-font-heading');
		expect(desc.className).toContain('text-muted-foreground');
		expect(content.getAttribute('aria-labelledby')).toBe(title.getAttribute('id'));
		expect(content.getAttribute('aria-describedby')).toBe(desc.getAttribute('id'));
		expect($('[data-slot="dialog-header"]')!.className).toContain('flex-col');
		expect($('[data-slot="dialog-footer"]')!.className).toContain('border-t');

		// The default close button: a ghost icon-sm Button hosting an icon + sr-only label.
		const closeButtons = $$('[data-slot="dialog-close"]');
		const iconClose = $$('[data-slot="dialog-close"]').find((el) =>
			el.className.includes('absolute'),
		)!;
		expect(iconClose).not.toBe(undefined);
		expect(iconClose.tagName).toBe('BUTTON');
		expect(iconClose.className).toContain('group/button');
		expect(iconClose.className).toContain('hover:bg-muted');
		expect(iconClose.className).toContain('size-7');
		expect(iconClose.querySelector('svg')).not.toBe(null);
		expect(iconClose.querySelector('.sr-only')!.textContent).toBe('Close');

		// DialogFooter showCloseButton renders an outline "Close" Button.
		const footerClose = $$('[data-slot="dialog-footer"] button').find(
			(el) => el.textContent === 'Close',
		)!;
		expect(footerClose).not.toBe(undefined);
		expect(footerClose.className).toContain('bg-background');

		// Focus moved into the dialog.
		expect(content.contains(document.activeElement)).toBe(true);
		r.unmount();
	});

	it('the icon close button, a DialogClose child, and Escape all close', async () => {
		const r = mount(DialogFixture);
		await settle();
		r.click('[data-testid="dialog-trigger"]');
		await settle();
		expect($('[data-slot="dialog-content"]')).not.toBe(null);

		// Portal'd close button — outside the container-scoped click helper.
		const iconClose = $$('[data-slot="dialog-close"]').find((el) =>
			el.className.includes('absolute'),
		)!;
		flushSync(() => iconClose.click());
		await settle();
		expect($('[data-slot="dialog-content"]')).toBe(null);
		expect($('[data-slot="dialog-overlay"]')).toBe(null);

		// A DialogClose child in the footer closes too.
		r.click('[data-testid="dialog-trigger"]');
		await settle();
		expect($('[data-slot="dialog-content"]')).not.toBe(null);
		flushSync(() => $('[data-testid="dialog-cancel"]')!.click());
		await settle();
		expect($('[data-slot="dialog-content"]')).toBe(null);

		// Escape closes.
		r.click('[data-testid="dialog-trigger"]');
		await settle();
		expect($('[data-slot="dialog-content"]')).not.toBe(null);
		pressEscape();
		await settle();
		expect($('[data-slot="dialog-content"]')).toBe(null);
		r.unmount();
	});

	it('showCloseButton={false} renders no default close button', async () => {
		const r = mount(DialogNoCloseFixture);
		await settle();
		r.click('[data-testid="dialog-trigger"]');
		await settle();
		const content = $('[data-slot="dialog-content"]')!;
		expect(content).not.toBe(null);
		expect(
			Array.from(content.querySelectorAll('[data-slot="button"]')).find((el) =>
				el.className.includes('absolute'),
			),
		).toBe(undefined);
		r.unmount();
	});
});

describe('@octanejs/shadcn — AlertDialog', () => {
	afterEach(async () => {
		await settle();
	});

	it('open: alertdialog role, size attr, slot contract, cancel autofocus, button contract', async () => {
		const r = mount(AlertDialogFixture);
		await settle();
		const trigger = $('[data-testid="alert-trigger"]')!;
		expect(trigger.getAttribute('data-slot')).toBe('alert-dialog-trigger');
		expect($('[data-slot="alert-dialog-content"]')).toBe(null);

		r.click('[data-testid="alert-trigger"]');
		await settle();

		const content = $('[data-slot="alert-dialog-content"]')!;
		expect(content).not.toBe(null);
		expect(document.body.contains(content)).toBe(true);
		expect(content.getAttribute('role')).toBe('alertdialog');
		expect(content.getAttribute('data-size')).toBe('sm');
		expect(content.className).toContain('bg-popover');
		expect(content.className).toContain('group/alert-dialog-content');
		expect($('[data-slot="alert-dialog-overlay"]')!.className).toContain('fixed');
		expect($('[data-slot="alert-dialog-header"]')!.className).toContain('place-items-center');
		expect($('[data-slot="alert-dialog-media"]')!.className).toContain('bg-muted');
		expect($('[data-slot="alert-dialog-footer"]')!.className).toContain('border-t');

		const title = $('[data-slot="alert-dialog-title"]')!;
		const desc = $('[data-slot="alert-dialog-description"]')!;
		expect(title.className).toContain('cn-font-heading');
		expect(content.getAttribute('aria-labelledby')).toBe(title.getAttribute('id'));
		expect(content.getAttribute('aria-describedby')).toBe(desc.getAttribute('id'));

		// Action/Cancel keep the full Button contract on the primitive host.
		const action = $('[data-testid="alert-action"]')!;
		expect(action.tagName).toBe('BUTTON');
		expect(action.getAttribute('data-slot')).toBe('alert-dialog-action');
		expect(action.className).toContain('group/button');
		expect(action.className).toContain('bg-destructive/10');
		expect(action.getAttribute('data-slot')).toBe('alert-dialog-action');
		const cancel = $('[data-testid="alert-cancel"]')!;
		expect(cancel.getAttribute('data-slot')).toBe('alert-dialog-cancel');
		expect(cancel.className).toContain('bg-background');
		expect(cancel.getAttribute('data-slot')).toBe('alert-dialog-cancel');

		// Opening autofocuses the CANCEL action (the safe choice).
		expect(document.activeElement).toBe(cancel);
		r.unmount();
	});

	it('outside press does NOT dismiss; cancel, action, and Escape close', async () => {
		const r = mount(AlertDialogFixture);
		await settle();
		r.click('[data-testid="alert-trigger"]');
		await settle();
		expect($('[data-slot="alert-dialog-content"]')).not.toBe(null);

		// Alert dialogs ignore outside interactions (the radix contract).
		press($('[data-slot="alert-dialog-overlay"]')!);
		await settle();
		expect($('[data-slot="alert-dialog-content"]')).not.toBe(null);

		flushSync(() => $('[data-testid="alert-cancel"]')!.click());
		await settle();
		expect($('[data-slot="alert-dialog-content"]')).toBe(null);

		r.click('[data-testid="alert-trigger"]');
		await settle();
		flushSync(() => $('[data-testid="alert-action"]')!.click());
		await settle();
		expect($('[data-slot="alert-dialog-content"]')).toBe(null);

		r.click('[data-testid="alert-trigger"]');
		await settle();
		pressEscape();
		await settle();
		expect($('[data-slot="alert-dialog-content"]')).toBe(null);
		r.unmount();
	});
});

describe('@octanejs/shadcn — Sheet', () => {
	afterEach(async () => {
		await settle();
	});

	it('open: side attr, class/slot contract, overlay, close button', async () => {
		const r = mount(SheetFixture);
		await settle();
		expect($('[data-testid="sheet-trigger"]')!.getAttribute('data-slot')).toBe('sheet-trigger');
		expect($('[data-slot="sheet-content"]')).toBe(null);

		r.click('[data-testid="sheet-trigger"]');
		await settle();

		const content = $('[data-slot="sheet-content"]')!;
		expect(content).not.toBe(null);
		expect(document.body.contains(content)).toBe(true);
		expect(content.getAttribute('data-side')).toBe('left');
		expect(content.getAttribute('role')).toBe('dialog');
		expect(content.getAttribute('data-state')).toBe('open');
		expect(content.className).toContain('fixed');
		expect($('[data-slot="sheet-overlay"]')!.className).toContain('bg-black/10');
		expect($('[data-slot="sheet-header"]')!.className).toContain('flex');
		expect($('[data-slot="sheet-footer"]')!.className).toContain('flex');

		const title = $('[data-slot="sheet-title"]')!;
		const desc = $('[data-slot="sheet-description"]')!;
		expect(title.className).toContain('text-foreground');
		expect(content.getAttribute('aria-labelledby')).toBe(title.getAttribute('id'));
		expect(content.getAttribute('aria-describedby')).toBe(desc.getAttribute('id'));

		// The default close button: a ghost icon-sm Button with icon + sr-only label.
		const iconClose = $$('[data-slot="sheet-content"] button').find(
			(el) => el.querySelector('.sr-only')?.textContent === 'Close',
		)!;
		expect(iconClose).not.toBe(undefined);
		expect(iconClose.className).toContain('hover:bg-muted');
		expect(iconClose.className).toContain('size-7');
		expect(iconClose.querySelector('svg')).not.toBe(null);
		expect(iconClose.querySelector('.sr-only')!.textContent).toBe('Close');
		r.unmount();
	});

	it('a SheetClose child and Escape both close', async () => {
		const r = mount(SheetFixture);
		await settle();
		r.click('[data-testid="sheet-trigger"]');
		await settle();
		expect($('[data-slot="sheet-content"]')).not.toBe(null);

		flushSync(() => $('[data-testid="sheet-cancel"]')!.click());
		await settle();
		expect($('[data-slot="sheet-content"]')).toBe(null);
		expect($('[data-slot="sheet-overlay"]')).toBe(null);

		r.click('[data-testid="sheet-trigger"]');
		await settle();
		expect($('[data-slot="sheet-content"]')).not.toBe(null);
		pressEscape();
		await settle();
		expect($('[data-slot="sheet-content"]')).toBe(null);
		r.unmount();
	});
});

describe('@octanejs/shadcn — Tooltip', () => {
	afterEach(async () => {
		await settle();
	});

	it('closed at mount; focus opens instantly with content, a11y copy, and one visible arrow', async () => {
		const r = mount(TooltipFixture);
		await settle();
		const trigger = $('[data-testid="tooltip-trigger"]')!;
		expect(trigger.getAttribute('data-slot')).toBe('tooltip-trigger');
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect($('[data-slot="tooltip-content"]')).toBe(null);

		// The wrapper's delayDuration default is 0 — focus opens instantly.
		flushSync(() => trigger.focus());
		await settle();

		const content = $('[data-slot="tooltip-content"]')!;
		expect(content).not.toBe(null);
		expect(document.body.contains(content)).toBe(true);
		expect(content.className).toContain('z-50');
		expect(content.className).toContain('extra-tip');
		expect(content.closest('[data-radix-popper-content-wrapper]')).not.toBe(null);
		expect(content.textContent).toContain('Tip text');

		// The a11y copy carries role=tooltip + the describedby id.
		const describedBy = trigger.getAttribute('aria-describedby')!;
		expect(describedBy).toBeTruthy();
		const vh = document.getElementById(describedBy)!;
		expect(vh.getAttribute('role')).toBe('tooltip');
		expect(vh.textContent).toContain('Tip text');

		// The arrow renders once — the copy inside the hidden a11y clone is suppressed.
		expect($$('[data-slot="tooltip-content"] svg').length).toBe(1);
		r.unmount();
	});

	it('blur and Escape both close', async () => {
		const r = mount(TooltipFixture);
		await settle();
		const trigger = $('[data-testid="tooltip-trigger"]')!;

		flushSync(() => trigger.focus());
		await settle();
		expect($('[data-slot="tooltip-content"]')).not.toBe(null);
		flushSync(() => trigger.blur());
		await settle();
		expect($('[data-slot="tooltip-content"]')).toBe(null);

		flushSync(() => trigger.focus());
		await settle();
		expect($('[data-slot="tooltip-content"]')).not.toBe(null);
		pressEscape();
		await settle();
		expect($('[data-slot="tooltip-content"]')).toBe(null);
		r.unmount();
	});
});

describe('@octanejs/shadcn — Popover', () => {
	afterEach(async () => {
		await settle();
	});

	it('press toggles; content is popper-positioned with role=dialog and the slot contract', async () => {
		const r = mount(PopoverFixture);
		await settle();
		const trigger = $('[data-testid="popover-trigger"]')!;
		expect(trigger.getAttribute('data-slot')).toBe('popover-trigger');
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect($('[data-slot="popover-content"]')).toBe(null);

		press(trigger);
		await settle();

		const content = $('[data-slot="popover-content"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('role')).toBe('dialog');
		expect(content.getAttribute('data-state')).toBe('open');
		expect(content.className).toContain('z-50');
		expect(content.className).toContain('extra-pop');
		expect(document.body.contains(content)).toBe(true);
		expect(content.closest('[data-radix-popper-content-wrapper]')).not.toBe(null);
		expect(trigger.getAttribute('aria-expanded')).toBe('true');

		// The static parts render inside the portaled content.
		const header = $('[data-slot="popover-header"]')!;
		expect(content.contains(header)).toBe(true);
		expect(header.className).toContain('gap-0.5');
		const title = $('[data-slot="popover-title"]')!;
		expect(title.tagName).toBe('DIV'); // upstream renders a div despite the h2 prop type
		expect(title.className).toContain('font-medium');
		const desc = $('[data-slot="popover-description"]')!;
		expect(desc.tagName).toBe('P');
		expect(desc.className).toContain('text-muted-foreground');

		// Toggle closed via the trigger.
		press(trigger);
		await settle();
		expect($('[data-slot="popover-content"]')).toBe(null);
		r.unmount();
	});

	it('outside press and Escape dismiss', async () => {
		const r = mount(PopoverFixture);
		await settle();
		const trigger = $('[data-testid="popover-trigger"]')!;
		press(trigger);
		await settle();
		expect($('[data-slot="popover-content"]')).not.toBe(null);

		press(document.body);
		await settle();
		expect($('[data-slot="popover-content"]')).toBe(null);

		press(trigger);
		await settle();
		expect($('[data-slot="popover-content"]')).not.toBe(null);
		pressEscape();
		await settle();
		expect($('[data-slot="popover-content"]')).toBe(null);
		r.unmount();
	});

	it('PopoverAnchor renders with its slot and the popover still opens', async () => {
		const r = mount(PopoverWithAnchorFixture);
		await settle();
		const anchor = $('[data-testid="popover-anchor"]')!;
		expect(anchor).not.toBe(null);
		expect(anchor.getAttribute('data-slot')).toBe('popover-anchor');
		press($('[data-testid="popover-trigger"]')!);
		await settle();
		expect($('[data-slot="popover-content"]')).not.toBe(null);
		r.unmount();
	});
});

describe('@octanejs/shadcn — HoverCard', () => {
	afterEach(async () => {
		await settle();
	});

	it('pointer-enter opens after openDelay with the class/slot contract; pointer-leave closes', async () => {
		const r = mount(HoverCardFixture);
		await settle();
		const trigger = $('[data-testid="hover-trigger"]')!;
		expect(trigger.getAttribute('data-slot')).toBe('hover-card-trigger');
		expect(trigger.tagName).toBe('A');
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect($('[data-slot="hover-card-content"]')).toBe(null);

		flushSync(() => {
			trigger.dispatchEvent(
				new PointerEvent('pointerenter', { bubbles: false, pointerType: 'mouse' }),
			);
		});
		await new Promise((res) => setTimeout(res, 70));
		await settle();

		const content = $('[data-slot="hover-card-content"]')!;
		expect(content).not.toBe(null);
		expect(document.body.contains(content)).toBe(true);
		expect(content.className).toContain('z-50');
		expect(content.className).toContain('extra-card');
		expect(content.getAttribute('data-state')).toBe('open');
		expect(content.closest('[data-radix-popper-content-wrapper]')).not.toBe(null);
		expect(trigger.getAttribute('data-state')).toBe('open');

		flushSync(() => {
			trigger.dispatchEvent(
				new PointerEvent('pointerleave', { bubbles: false, pointerType: 'mouse' }),
			);
		});
		await new Promise((res) => setTimeout(res, 60));
		await settle();
		expect($('[data-slot="hover-card-content"]')).toBe(null);
		expect(trigger.getAttribute('data-state')).toBe('closed');
		r.unmount();
	});

	it('focus opens after the delay; Escape dismisses immediately', async () => {
		const r = mount(HoverCardFixture);
		await settle();
		const trigger = $('[data-testid="hover-trigger"]')!;

		flushSync(() => trigger.focus());
		await new Promise((res) => setTimeout(res, 70));
		await settle();
		expect($('[data-slot="hover-card-content"]')).not.toBe(null);

		pressEscape();
		await settle();
		expect($('[data-slot="hover-card-content"]')).toBe(null);
		r.unmount();
	});
});
