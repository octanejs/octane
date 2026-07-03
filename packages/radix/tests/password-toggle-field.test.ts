import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { PasswordFieldApp, PasswordFieldIconApp } from './_fixtures/password-toggle-field.tsx';

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

function click(el: Element): void {
	flushSync(() => {
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	});
}

// jsdom's el.click() emits ONLY click — the Toggle's focus-retention bookkeeping is
// keyed off pointerdown, so dispatch the full pointer sequence.
function pointerClick(el: Element): void {
	flushSync(() => {
		el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
		el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }));
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	});
}

describe('@octanejs/radix — PasswordToggleField', () => {
	afterEach(async () => {
		await settle();
	});

	it('mounts with a hidden password input and a wired-up toggle button', async () => {
		const r = mount(PasswordFieldApp);
		const $ = inC(r.container);
		await settle();
		const input = $('[data-testid="input"]') as HTMLInputElement;
		const toggle = $('[data-testid="toggle"]') as HTMLButtonElement;

		expect(input.getAttribute('type')).toBe('password');
		expect(input.getAttribute('autocomplete')).toBe('current-password');
		expect(input.getAttribute('autocapitalize')).toBe('off');
		expect(input.getAttribute('spellcheck')).toBe('false');
		expect(input.id).not.toBe('');

		expect(toggle.getAttribute('type')).toBe('button');
		// Hydrated (client mount): visible to AT and associated with the input.
		expect(toggle.getAttribute('aria-hidden')).toBe(null);
		expect(toggle.getAttribute('aria-controls')).toBe(input.id);
		// The Slot renders the per-state text child; with inner text present the
		// toggle derives NO default aria-label.
		expect(toggle.textContent).toBe('Show');
		expect(toggle.getAttribute('aria-label')).toBe(null);
		r.unmount();
	});

	it('toggle click flips the input type, the Slot children, and reports onVisibilityChange', async () => {
		const r = mount(PasswordFieldApp);
		const $ = inC(r.container);
		await settle();
		const input = $('[data-testid="input"]') as HTMLInputElement;
		const toggle = $('[data-testid="toggle"]')!;

		click(toggle);
		await settle();
		expect(input.getAttribute('type')).toBe('text');
		expect(toggle.textContent).toBe('Hide');
		expect($('[data-testid="visibility"]')!.textContent).toBe('visible');

		click(toggle);
		await settle();
		expect(input.getAttribute('type')).toBe('password');
		expect(toggle.textContent).toBe('Show');
		expect($('[data-testid="visibility"]')!.textContent).toBe('hidden');
		r.unmount();
	});

	it('keeps focus in the input (restoring the selection recorded at blur) when the toggle is pointer-clicked', async () => {
		const r = mount(PasswordFieldApp);
		const $ = inC(r.container);
		await settle();
		const input = $('[data-testid="input"]') as HTMLInputElement;
		const toggle = $('[data-testid="toggle"]') as HTMLButtonElement;

		input.focus();
		input.value = 'password';
		input.selectionStart = 2;
		input.selectionEnd = 6;
		// Moving focus to the toggle blurs the input — the Input's onBlur records the
		// selection into the shared focusState.
		toggle.focus();
		await settle();
		expect(document.activeElement).toBe(toggle);

		pointerClick(toggle);
		await settle();
		expect(input.getAttribute('type')).toBe('text');
		// pointerdown marked clickTriggered, so click re-focused the input…
		expect(document.activeElement).toBe(input);
		// …and a rAF later the recorded selection is restored.
		await new Promise((res) => requestAnimationFrame(() => res(null)));
		await settle();
		expect(input.selectionStart).toBe(2);
		expect(input.selectionEnd).toBe(6);
		// The value survives the type flip.
		expect(input.value).toBe('password');
		r.unmount();
	});

	it('does NOT pull focus into the input when toggled without a pointerdown (keyboard-style click)', async () => {
		const r = mount(PasswordFieldApp);
		const $ = inC(r.container);
		await settle();
		const input = $('[data-testid="input"]') as HTMLInputElement;
		const toggle = $('[data-testid="toggle"]') as HTMLButtonElement;

		toggle.focus();
		click(toggle); // click only — no pointerdown, so clickTriggered stays false
		await settle();
		expect(input.getAttribute('type')).toBe('text');
		expect(document.activeElement).toBe(toggle);
		r.unmount();
	});

	it('resets visibility to hidden when the form is submitted (even with preventDefault) or reset', async () => {
		const r = mount(PasswordFieldApp);
		const $ = inC(r.container);
		await settle();
		const input = $('[data-testid="input"]') as HTMLInputElement;
		const toggle = $('[data-testid="toggle"]')!;
		const form = $('[data-testid="form"]') as HTMLFormElement;

		click(toggle);
		await settle();
		expect(input.getAttribute('type')).toBe('text');

		// Submit: the fixture's onSubmit calls preventDefault, but visibility must
		// reset regardless.
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settle();
		expect($('[data-testid="submits"]')!.textContent).toBe('1');
		expect(input.getAttribute('type')).toBe('password');
		expect($('[data-testid="visibility"]')!.textContent).toBe('hidden');

		// Reset flips it back to hidden too.
		click(toggle);
		await settle();
		expect(input.getAttribute('type')).toBe('text');
		form.dispatchEvent(new Event('reset', { bubbles: true, cancelable: true }));
		await settle();
		expect(input.getAttribute('type')).toBe('password');
		r.unmount();
	});

	it('defaultVisible starts revealed', async () => {
		const r = mount(PasswordFieldApp, { defaultVisible: true });
		const $ = inC(r.container);
		await settle();
		expect(($('[data-testid="input"]') as HTMLInputElement).getAttribute('type')).toBe('text');
		expect($('[data-testid="toggle"]')!.textContent).toBe('Hide');
		r.unmount();
	});

	it('Icon renders the per-state icon and the toggle derives its default aria-label', async () => {
		const r = mount(PasswordFieldIconApp);
		const $ = inC(r.container);
		await settle();
		const toggle = $('[data-testid="toggle"]')!;

		// Hidden state: closed icon only, aria-hidden projected onto it, and — with no
		// text content — the default aria-label.
		const closed = $('[data-testid="icon-closed"]')!;
		expect(closed).not.toBe(null);
		expect(closed.tagName.toLowerCase()).toBe('svg');
		expect(closed.getAttribute('aria-hidden')).toBe('true');
		expect($('[data-testid="icon-open"]')).toBe(null);
		expect(toggle.getAttribute('aria-label')).toBe('Show password');

		click(toggle);
		await settle();
		expect($('[data-testid="icon-open"]')).not.toBe(null);
		expect($('[data-testid="icon-closed"]')).toBe(null);
		expect(toggle.getAttribute('aria-label')).toBe('Hide password');
		expect(($('[data-testid="input"]') as HTMLInputElement).getAttribute('type')).toBe('text');
		r.unmount();
	});
});
