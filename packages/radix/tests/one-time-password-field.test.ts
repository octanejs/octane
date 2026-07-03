import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { OtpApp } from './_fixtures/one-time-password-field.tsx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

// The source's keydown/focus orchestration defers via requestAnimationFrame; give the
// frame time to run (vitest's jsdom is pretendToBeVisual, rAF ticks at ~16ms).
async function nextFrame(): Promise<void> {
	await new Promise((res) => setTimeout(res, 40));
	await settle();
}

const inC =
	(container: HTMLElement) =>
	(sel: string): HTMLElement | null =>
		container.querySelector(sel);

function cells(container: HTMLElement): HTMLInputElement[] {
	return Array.from(container.querySelectorAll<HTMLInputElement>('input[data-radix-otp-input]'));
}

function cellValues(container: HTMLElement): string {
	return cells(container)
		.map((c) => c.value)
		.join(',');
}

// jsdom has no real typing: focus the cell, set the value property (dirtying the input,
// like real typing does), then dispatch a native InputEvent.
function typeChar(input: HTMLInputElement, ch: string): void {
	input.focus();
	flushSync(() => {
		input.value = ch;
		input.dispatchEvent(
			new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }),
		);
	});
}

function pressKey(el: Element, key: string, init: KeyboardEventInit = {}): void {
	flushSync(() => {
		el.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init }),
		);
	});
}

// jsdom implements neither ClipboardEvent nor DataTransfer — construct a plain Event
// with a clipboardData shim (established jsdom workaround; the handler only calls
// `clipboardData.getData('text/plain')`).
function paste(el: Element, text: string): void {
	const event = new Event('paste', { bubbles: true, cancelable: true });
	(event as any).clipboardData = {
		getData: (type: string) => (type === 'text/plain' ? text : ''),
	};
	flushSync(() => {
		el.dispatchEvent(event);
	});
}

function click(el: Element): void {
	flushSync(() => {
		(el as HTMLElement).click();
	});
}

describe('@octanejs/radix — OneTimePasswordField', () => {
	afterEach(async () => {
		await settle();
	});

	it('renders 6 cells with aria/autocomplete/validation wiring and a named hidden input', async () => {
		const r = mount(OtpApp, { placeholder: '000000' });
		const $ = inC(r.container);
		await settle();

		const root = $('[data-testid="root"]')!;
		expect(root.getAttribute('role')).toBe('group');

		const cs = cells(r.container);
		expect(cs.length).toBe(6);
		cs.forEach((cell, i) => {
			expect(cell.getAttribute('aria-label')).toBe(`Character ${i + 1} of 6`);
			expect(cell.getAttribute('inputmode')).toBe('numeric');
			expect(cell.getAttribute('pattern')).toBe('\\d{1}');
			expect(cell.getAttribute('data-radix-index')).toBe(String(i));
			expect(cell.getAttribute('type')).toBe('text');
			// per-character placeholder while the field is empty
			expect(cell.getAttribute('placeholder')).toBe('0');
		});
		// Only the tab-stop candidate (first cell before any focus) supports autocomplete
		// and receives the full-length maxLength for OS/password-manager code insertion.
		expect(cs[0].getAttribute('autocomplete')).toBe('one-time-code');
		expect(cs[0].getAttribute('maxlength')).toBe('6');
		expect(cs[0].hasAttribute('data-1p-ignore')).toBe(false);
		for (let i = 1; i < 6; i++) {
			expect(cs[i].getAttribute('autocomplete')).toBe('off');
			expect(cs[i].getAttribute('maxlength')).toBe('1');
			expect(cs[i].getAttribute('data-1p-ignore')).toBe('true');
		}

		const hidden = $('[data-testid="hidden"]') as HTMLInputElement;
		expect(hidden.type).toBe('hidden');
		expect(hidden.name).toBe('code');
		expect(hidden.value).toBe('');
		expect(hidden.getAttribute('autocomplete')).toBe('off');
		r.unmount();
	});

	it('typing a character sets the value and advances focus to the next cell', async () => {
		const r = mount(OtpApp);
		const $ = inC(r.container);
		await settle();
		const cs = cells(r.container);
		const hidden = $('[data-testid="hidden"]') as HTMLInputElement;

		typeChar(cs[0], '1');
		await settle();
		expect(cs[0].value).toBe('1');
		expect(document.activeElement).toBe(cs[1]);
		expect(hidden.value).toBe('1');
		expect($('[data-testid="value"]')!.textContent).toBe('1');

		typeChar(cs[1], '2');
		await settle();
		expect(cs[1].value).toBe('2');
		expect(document.activeElement).toBe(cs[2]);
		expect(hidden.value).toBe('12');
		expect($('[data-testid="value"]')!.textContent).toBe('12');
		r.unmount();
	});

	it('Backspace on an empty cell retreats focus; on a filled cell it clears and retreats', async () => {
		const r = mount(OtpApp);
		const $ = inC(r.container);
		await settle();
		const cs = cells(r.container);
		const hidden = $('[data-testid="hidden"]') as HTMLInputElement;

		typeChar(cs[0], '1');
		typeChar(cs[1], '2');
		await settle();
		expect(document.activeElement).toBe(cs[2]);

		// empty cell: no input event will fire — keydown retreats focus in the next frame
		pressKey(cs[2], 'Backspace');
		await nextFrame();
		expect(document.activeElement).toBe(cs[1]);
		expect(hidden.value).toBe('12');

		// filled cell: keydown marks the action, the browser clears the value and fires
		// an input event (simulated here), and the change logic clears + retreats
		pressKey(cs[1], 'Backspace');
		flushSync(() => {
			cs[1].value = '';
			cs[1].dispatchEvent(
				new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }),
			);
		});
		await settle();
		expect(hidden.value).toBe('1');
		expect(cs[1].value).toBe('');
		expect(document.activeElement).toBe(cs[0]);
		r.unmount();
	});

	it('paste distributes characters across cells (sanitized + truncated) and focuses the last filled cell', async () => {
		const r = mount(OtpApp);
		const $ = inC(r.container);
		await settle();
		const cs = cells(r.container);
		const hidden = $('[data-testid="hidden"]') as HTMLInputElement;
		const root = $('[data-testid="root"]')!;

		// whitespace is stripped by sanitization
		paste(root, '12 34\t56');
		await settle();
		expect(cellValues(r.container)).toBe('1,2,3,4,5,6');
		expect(hidden.value).toBe('123456');
		expect(document.activeElement).toBe(cs[5]);

		// longer codes truncate to the number of cells
		paste(root, '987654321');
		await settle();
		expect(cellValues(r.container)).toBe('9,8,7,6,5,4');
		expect(hidden.value).toBe('987654');
		r.unmount();
	});

	it('rejects characters that fail the numeric validation type', async () => {
		const r = mount(OtpApp);
		const $ = inC(r.container);
		await settle();
		const cs = cells(r.container);
		const hidden = $('[data-testid="hidden"]') as HTMLInputElement;

		typeChar(cs[0], 'a');
		await settle();
		// no state change, DOM value re-asserted back to empty (React's controlled reassertion)
		expect(cs[0].value).toBe('');
		expect(hidden.value).toBe('');
		expect($('[data-testid="value"]')!.textContent).toBe('');
		// the native pattern flagged it — onInvalidChange fired
		expect($('[data-testid="invalids"]')!.textContent).toBe('1');

		// pasted values are sanitized rather than rejected
		paste($('[data-testid="root"]')!, '1a2b3c');
		await settle();
		expect(hidden.value).toBe('123');
		expect(cellValues(r.container)).toBe('1,2,3,,,');
		r.unmount();
	});

	it('autoSubmit requests form submission when all cells fill; Enter submits explicitly', async () => {
		const r = mount(OtpApp, { autoSubmit: true });
		const $ = inC(r.container);
		await settle();
		const cs = cells(r.container);
		const form = $('[data-testid="form"]') as HTMLFormElement;

		paste($('[data-testid="root"]')!, '123456');
		await settle();
		expect(new FormData(form).get('code')).toBe('123456');
		expect($('[data-testid="auto-submitted"]')!.textContent).toBe('123456');
		expect($('[data-testid="submits"]')!.textContent).toBe('1');

		// Enter on any cell submits the located form
		pressKey(cs[0], 'Enter');
		await settle();
		expect($('[data-testid="submits"]')!.textContent).toBe('2');
		r.unmount();
	});

	it('form reset clears the whole field', async () => {
		const r = mount(OtpApp);
		const $ = inC(r.container);
		await settle();
		const hidden = $('[data-testid="hidden"]') as HTMLInputElement;

		paste($('[data-testid="root"]')!, '123456');
		await settle();
		expect(hidden.value).toBe('123456');

		click($('[data-testid="reset"]')!);
		await settle();
		expect(hidden.value).toBe('');
		expect(cellValues(r.container)).toBe(',,,,,');
		expect($('[data-testid="value"]')!.textContent).toBe('');
		r.unmount();
	});

	it('typing into the last cell of a full field replaces the char, keeps focus, and re-selects it (from() clamps at the end)', async () => {
		const r = mount(OtpApp);
		const $ = inC(r.container);
		await settle();
		const cs = cells(r.container);
		const hidden = $('[data-testid="hidden"]') as HTMLInputElement;

		paste($('[data-testid="root"]')!, '123456');
		await settle();
		expect(document.activeElement).toBe(cs[5]);

		// full field: SET_CHAR resolves `from(last, +1)` to the LAST cell itself (source's
		// OrderedDict.from clamps) and focusInput re-selects it via rAF, so the next
		// keystroke replaces the char instead of appending after an unselected caret.
		typeChar(cs[5], '9');
		await nextFrame();
		expect(cellValues(r.container)).toBe('1,2,3,4,5,9');
		expect(hidden.value).toBe('123459');
		expect(document.activeElement).toBe(cs[5]);
		expect(cs[5].selectionStart).toBe(0);
		expect(cs[5].selectionEnd).toBe(1);

		// same-char branch clamps identically: typing the value already present in the
		// last cell keeps it focused and selected
		typeChar(cs[5], '9');
		await nextFrame();
		expect(hidden.value).toBe('123459');
		expect(document.activeElement).toBe(cs[5]);
		expect(cs[5].selectionStart).toBe(0);
		expect(cs[5].selectionEnd).toBe(1);
		r.unmount();
	});

	it('mounting/unmounting a cell re-renders every sibling cell (aria-label, maxLength, data-radix-index refresh)', async () => {
		const r = mount(OtpApp);
		const $ = inC(r.container);
		await settle();

		let cs = cells(r.container);
		expect(cs.length).toBe(6);
		expect(cs[0].getAttribute('aria-label')).toBe('Character 1 of 6');
		expect(cs[0].getAttribute('maxlength')).toBe('6');

		// add a 7th cell — EVERY existing cell must pick up the new count immediately
		click($('[data-testid="toggle-cell"]')!);
		await settle();
		cs = cells(r.container);
		expect(cs.length).toBe(7);
		cs.forEach((cell, i) => {
			expect(cell.getAttribute('aria-label')).toBe(`Character ${i + 1} of 7`);
			expect(cell.getAttribute('data-radix-index')).toBe(String(i));
		});
		// the tab-stop cell's maxLength tracks the new size
		expect(cs[0].getAttribute('maxlength')).toBe('7');
		expect(cs[6].getAttribute('maxlength')).toBe('1');

		// remove it again — siblings revert to the smaller count
		click($('[data-testid="toggle-cell"]')!);
		await settle();
		cs = cells(r.container);
		expect(cs.length).toBe(6);
		cs.forEach((cell, i) => {
			expect(cell.getAttribute('aria-label')).toBe(`Character ${i + 1} of 6`);
			expect(cell.getAttribute('data-radix-index')).toBe(String(i));
		});
		expect(cs[0].getAttribute('maxlength')).toBe('6');
		r.unmount();
	});

	it('disabled Root disables every cell; password type + defaultValue prefill the cells', async () => {
		const r1 = mount(OtpApp, { disabled: true });
		await settle();
		for (const cell of cells(r1.container)) {
			expect(cell.disabled).toBe(true);
		}
		r1.unmount();

		const r2 = mount(OtpApp, { type: 'password', defaultValue: '123456' });
		const $ = inC(r2.container);
		await settle();
		const cs = cells(r2.container);
		expect(cs[0].getAttribute('type')).toBe('password');
		expect(cellValues(r2.container)).toBe('1,2,3,4,5,6');
		expect(($('[data-testid="hidden"]') as HTMLInputElement).value).toBe('123456');
		r2.unmount();
	});
});
