import { describe, expect, it } from 'vitest';
import { act, mount, nextPaint } from '../../octane/tests/_helpers';
import {
	ButtonScenario,
	FieldErrorScenario,
	FormScenario,
	LabeledField,
	LayoutScenario,
	LinkScenario,
	PendingButton,
	ProgressScenario,
} from './_fixtures/rac-primitives.tsx';

// @octanejs/aria Phase 4 — RAC field/layout primitives (Form / Label / Input /
// TextArea / FieldError / Group / Toolbar / Separator / Header / Heading /
// Link / ProgressBar / Button), driven through octane's NATIVE delegated events.

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		button: 0,
		pointerId: 1,
		pointerType: 'mouse',
		width: 20,
		height: 20,
		pressure: 0.5,
		detail: 1,
		...init,
	});
}

describe('@octanejs/aria/components — Button', () => {
	it('reflects press state in data-pressed and the className render prop, and fires onPress', async () => {
		const r = mount(ButtonScenario);
		const btn = r.container.querySelector('button')!;
		expect(btn.className).toBe('react-aria-Button');
		expect(btn.getAttribute('data-rac')).toBe('');
		expect(btn.hasAttribute('data-pressed')).toBe(false);

		await act(() => {
			btn.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
		});
		expect(btn.getAttribute('data-pressed')).toBe('true');
		expect(btn.className).toBe('react-aria-Button is-pressed');

		await act(() => {
			btn.dispatchEvent(pointerEvent('pointerup', { clientX: 5, clientY: 5 }));
			btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
		});
		expect(btn.hasAttribute('data-pressed')).toBe(false);
		expect(btn.className).toBe('react-aria-Button');
		expect(btn.textContent).toBe('presses:1');
		r.unmount();
	});

	it('reflects hover state in data-hovered and the className render prop', async () => {
		const r = mount(ButtonScenario);
		const btn = r.container.querySelector('button')!;

		await act(() => {
			btn.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		});
		expect(btn.getAttribute('data-hovered')).toBe('true');
		expect(btn.className).toBe('react-aria-Button is-hovered');

		await act(() => {
			btn.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		});
		expect(btn.hasAttribute('data-hovered')).toBe(false);
		expect(btn.className).toBe('react-aria-Button');
		r.unmount();
	});

	it('pending state sets data-pending, aria-disabled, and links the accessible name', async () => {
		const r = mount(PendingButton);
		const btn = r.container.querySelector('#save-btn') as HTMLButtonElement;
		expect(btn.hasAttribute('data-pending')).toBe(false);
		expect(btn.hasAttribute('aria-disabled')).toBe(false);

		await act(() => {
			(r.container.querySelector('#toggle-pending') as HTMLElement).click();
		});
		expect(btn.getAttribute('data-pending')).toBe('true');
		expect(btn.getAttribute('aria-disabled')).toBe('true');
		// aria-label present → the accessible name is rewired to buttonId + progressId.
		const labelledby = btn.getAttribute('aria-labelledby')!.split(' ');
		expect(labelledby).toHaveLength(2);
		expect(labelledby[0]).toBe(btn.id);
		expect(labelledby[1]).toBeTruthy();
		expect(labelledby[1]).not.toBe(btn.id);
		// Pressing while pending does not enter the pressed state.
		await act(() => {
			btn.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
		});
		expect(btn.hasAttribute('data-pressed')).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/aria/components — Label + Input + TextArea', () => {
	it('wires label htmlFor/id linkage through contexts under Provider', () => {
		const r = mount(LabeledField);
		const label = r.container.querySelector('label')!;
		const input = r.container.querySelector('input')!;
		expect(label.className).toBe('react-aria-Label');
		expect(label.getAttribute('for')).toBe('field-input');
		expect(label.id).toBe('field-label');
		expect(input.id).toBe('field-input');
		expect(input.getAttribute('aria-labelledby')).toBe('field-label');
		expect(input.className).toBe('react-aria-Input');
		expect(input.getAttribute('placeholder')).toBe('name');
		const textarea = r.container.querySelector('textarea')!;
		expect(textarea.className).toBe('react-aria-TextArea');
		r.unmount();
	});

	it('Input reflects hover state in data-hovered', async () => {
		const r = mount(LabeledField);
		const input = r.container.querySelector('input')!;
		expect(input.hasAttribute('data-hovered')).toBe(false);
		await act(() => {
			input.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		});
		expect(input.getAttribute('data-hovered')).toBe('true');
		await act(() => {
			input.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		});
		expect(input.hasAttribute('data-hovered')).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/aria/components — FieldError', () => {
	it('renders nothing while valid, then the joined errors once invalid', async () => {
		const r = mount(FieldErrorScenario);
		expect(r.container.querySelector('[data-testid="error"]')).toBeNull();
		expect(r.container.querySelector('[data-testid="error-fn"]')).toBeNull();

		await act(() => {
			(r.container.querySelector('#make-invalid') as HTMLElement).click();
		});
		const error = r.container.querySelector('[data-testid="error"]')!;
		expect(error.tagName).toBe('SPAN');
		expect(error.className).toBe('react-aria-FieldError');
		expect(error.getAttribute('slot')).toBe('errorMessage');
		expect(error.textContent).toBe('Value is required. Too short.');
		// The children render prop receives the ValidationResult values.
		expect(r.container.querySelector('[data-testid="error-fn"]')!.textContent).toBe(
			'errors:Value is required.+Too short.',
		);
		r.unmount();
	});
});

describe('@octanejs/aria/components — ProgressBar', () => {
	it('exposes the ARIA value attributes and the percentage render prop', () => {
		const r = mount(ProgressScenario);
		const pb = r.container.querySelector('#pb')!;
		expect(pb.getAttribute('role')).toBe('progressbar');
		expect(pb.className).toBe('react-aria-ProgressBar');
		expect(pb.getAttribute('aria-valuenow')).toBe('30');
		expect(pb.getAttribute('aria-valuemin')).toBe('0');
		expect(pb.getAttribute('aria-valuemax')).toBe('100');
		const valueText = pb.getAttribute('aria-valuetext')!;
		expect(pb.textContent).toBe('pct:30|' + valueText);
		r.unmount();
	});

	it('a slotted Label child renders as a span and provides the accessible name', async () => {
		const r = mount(ProgressScenario);
		await nextPaint();
		const pb = r.container.querySelector('#pb-labeled')!;
		const label = pb.querySelector('.react-aria-Label')!;
		expect(label.tagName).toBe('SPAN');
		expect(label.textContent).toBe('Upload');
		expect(pb.getAttribute('aria-labelledby')).toBe(label.id);
		r.unmount();
	});
});

describe('@octanejs/aria/components — Link', () => {
	it('renders an <a> for href links and a span[role=link] otherwise', () => {
		const r = mount(LinkScenario);
		const real = r.container.querySelector('#real-link')!;
		expect(real.tagName).toBe('A');
		expect(real.getAttribute('href')).toBe('https://example.com/docs');
		expect(real.getAttribute('target')).toBe('_blank');
		expect(real.className).toBe('react-aria-Link');

		const fake = r.container.querySelector('#span-link')!;
		expect(fake.tagName).toBe('SPAN');
		expect(fake.getAttribute('role')).toBe('link');
		expect(fake.getAttribute('tabindex')).toBe('0');

		const disabled = r.container.querySelector('#disabled-link')!;
		expect(disabled.tagName).toBe('SPAN');
		expect(disabled.getAttribute('data-disabled')).toBe('true');
		expect(disabled.getAttribute('aria-disabled')).toBe('true');
		r.unmount();
	});

	it('reflects hover state in data-hovered', async () => {
		const r = mount(LinkScenario);
		const real = r.container.querySelector('#real-link')!;
		await act(() => {
			real.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		});
		expect(real.getAttribute('data-hovered')).toBe('true');
		await act(() => {
			real.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		});
		expect(real.hasAttribute('data-hovered')).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/aria/components — layout primitives', () => {
	it('Group/Toolbar/Separator/Header/Heading render their roles and tags', () => {
		const r = mount(LayoutScenario);
		const grp = r.container.querySelector('#grp')!;
		expect(grp.getAttribute('role')).toBe('group');
		expect(grp.className).toBe('react-aria-Group');

		const tb = r.container.querySelector('#tb')!;
		expect(tb.getAttribute('role')).toBe('toolbar');
		expect(tb.className).toBe('react-aria-Toolbar');
		expect(tb.getAttribute('data-orientation')).toBe('vertical');
		expect(tb.getAttribute('aria-orientation')).toBe('vertical');
		// Toolbar children render inside it.
		expect(tb.querySelector('button')!.textContent).toBe('B1');

		const sep = r.container.querySelector('#sep')!;
		expect(sep.tagName).toBe('HR');
		expect(sep.getAttribute('role')).toBe('separator');
		expect(sep.className).toBe('react-aria-Separator');

		// A vertical separator renders as a div with an explicit aria-orientation.
		const vsep = r.container.querySelector('#vsep')!;
		expect(vsep.tagName).toBe('DIV');
		expect(vsep.getAttribute('aria-orientation')).toBe('vertical');

		const hd = r.container.querySelector('#hd')!;
		expect(hd.tagName).toBe('HEADER');
		expect(hd.className).toBe('react-aria-Header');
		expect(hd.textContent).toBe('Section');

		expect(r.container.querySelector('#h-default')!.tagName).toBe('H3');
		expect(r.container.querySelector('#h-default')!.className).toBe('react-aria-Heading');
		expect(r.container.querySelector('#h-one')!.tagName).toBe('H1');
		r.unmount();
	});
});

describe('@octanejs/aria/components — Form', () => {
	it('validationBehavior drives noValidate and validationErrors reach FormValidationContext', async () => {
		const r = mount(FormScenario);
		const form = r.container.querySelector('form')!;
		expect(form.className).toBe('react-aria-Form');
		expect(form.noValidate).toBe(false);
		expect(r.container.querySelector('[data-testid="server-errors"]')!.textContent).toBe(
			'username:Username is taken.',
		);

		await act(() => {
			(r.container.querySelector('#use-aria') as HTMLElement).click();
		});
		expect(form.noValidate).toBe(true);
		r.unmount();
	});

	it('a native form reset restores field default values', () => {
		const r = mount(FormScenario);
		const form = r.container.querySelector('form') as HTMLFormElement;
		const input = r.container.querySelector('#uname') as HTMLInputElement;
		expect(input.value).toBe('alice');
		input.value = 'bob';
		form.reset();
		expect(input.value).toBe('alice');
		r.unmount();
	});
});
