import { describe, expect, it } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import { Preview, Shortcuts, Tokens } from './_fixtures/aria-120.tsrx';

describe('React Aria Components 1.20 additions', () => {
	it('labels a token field and renders text and noneditable tokens', () => {
		const view = mount(Tokens, {});
		try {
			const input = view.container.querySelector('[role="textbox"]')!;
			expect(input.textContent?.replace(/\u200b/g, '')).toBe('Hello Ada');
			expect(document.getElementById(input.getAttribute('aria-labelledby')!)?.textContent).toBe(
				'Message',
			);
			expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe(
				'Choose recipients',
			);
			expect(input.querySelector('[contenteditable="false"]')?.textContent).toBe('Ada');
		} finally {
			view.unmount();
		}
	});

	it.each([{ isReadOnly: true }, { isDisabled: true }])('prevents editing for %j', (props) => {
		const view = mount(Tokens, props);
		try {
			expect(
				view.container.querySelector('[role="textbox"]')?.getAttribute('contenteditable'),
			).toBe('false');
		} finally {
			view.unmount();
		}
	});

	it('opens a preview on keyboard focus and closes on Escape', async () => {
		const view = mount(Preview);
		try {
			const trigger = view.container.querySelector('a')!;
			await act(() => {
				document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
				trigger.focus();
			});
			expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Read more');
			await act(() =>
				trigger.dispatchEvent(
					new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
				),
			);
			expect(document.querySelector('[role="dialog"]')).toBeNull();
			expect(document.activeElement).toBe(trigger);
		} finally {
			view.unmount();
		}
	});

	it('handles exact shortcuts and rearms propagation after an unmatched key', async () => {
		const view = mount(Shortcuts);
		try {
			const input = view.container.querySelector('input')!;
			const dispatch = async (init: KeyboardEventInit) => {
				const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
				await act(() => input.dispatchEvent(event));
				return event;
			};
			await dispatch({ key: 'x' });
			expect((await dispatch({ key: 'k', ctrlKey: true })).defaultPrevented).toBe(true);
			expect(view.container.querySelector('output')?.textContent).toBe('handled:1 bubbled:1');
			await dispatch({ key: 'k', ctrlKey: true, repeat: true });
			await dispatch({ key: 'k', ctrlKey: true, isComposing: true });
			expect(view.container.querySelector('output')?.textContent).toBe('handled:1 bubbled:3');
		} finally {
			view.unmount();
		}
	});
});
