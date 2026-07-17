import { describe, it, expect } from 'vitest';
import { act, mount, nextPaint } from '../../octane/tests/_helpers';
import {
	DisclosureHarness,
	SearchFieldHarness,
	ToolbarHarness,
	VisuallyHiddenHarness,
} from './_fixtures/leaf-behaviors.tsx';

// Behavior the HTML-only differential rig cannot observe for the Phase-1 leaf hooks:
// key-driven value changes, focus movement, and computed styles.

describe('@octanejs/aria — useSearchField', () => {
	it('Escape clears the value and Enter submits it', async () => {
		const r = mount(SearchFieldHarness);
		const input = r.container.querySelector('input')!;
		await act(() => {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
			setter.call(input, 'abc');
			input.dispatchEvent(new Event('input', { bubbles: true }));
		});
		expect(input.value).toBe('abc');

		await act(() => {
			input.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
			);
		});
		expect(r.container.querySelector('[data-submitted]')!.getAttribute('data-submitted')).toBe(
			'abc',
		);

		await act(() => {
			input.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
		});
		expect(input.value).toBe('');
		r.unmount();
	});
});

describe('@octanejs/aria — useDisclosure', () => {
	it('press toggles aria-expanded and the panel hidden state', async () => {
		const r = mount(DisclosureHarness);
		const btn = r.container.querySelector('button')!;
		const panel = r.container.querySelector('[role="group"]')!;
		expect(btn.getAttribute('aria-expanded')).toBe('false');
		expect(btn.getAttribute('aria-controls')).toBe(panel.id);
		expect(panel.hasAttribute('hidden')).toBe(true);

		await act(() => {
			btn.click();
		});
		await nextPaint();
		expect(btn.getAttribute('aria-expanded')).toBe('true');
		expect(panel.hasAttribute('hidden')).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/aria — useToolbar', () => {
	it('arrow keys move focus between the toolbar children', async () => {
		const r = mount(ToolbarHarness);
		const [first, second] = Array.from(r.container.querySelectorAll('button'));
		await act(() => {
			first.focus();
		});
		expect(document.activeElement).toBe(first);

		await act(() => {
			first.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
			);
		});
		expect(document.activeElement).toBe(second);

		await act(() => {
			second.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
			);
		});
		expect(document.activeElement).toBe(first);
		r.unmount();
	});
});

describe('@octanejs/aria — VisuallyHidden', () => {
	it('hides content off-screen and unhides while focused when focusable', async () => {
		const r = mount(VisuallyHiddenHarness);
		const region = r.container.querySelector('[data-vh]') as HTMLElement;
		expect(region.style.position).toBe('absolute');
		expect(region.style.width).toBe('1px');

		const link = region.querySelector('a') as HTMLAnchorElement;
		// Real focus: useFocusWithin guards on document.activeElement === target.
		await act(() => {
			link.focus();
		});
		// Focused skip-link: the hiding styles are dropped.
		expect(region.style.width).not.toBe('1px');
		r.unmount();
	});
});
