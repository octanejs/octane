import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@octanejs/testing-library';
import { App, TextField } from '@octane-eval-submission/octane.ref-composition/src/App.tsrx';

afterEach(cleanup);

describe('ref-as-prop composition', () => {
	it('passes a callback ref through a function component and clears it', () => {
		const calls: Array<HTMLInputElement | null> = [];
		const view = render(TextField, {
			props: {
				id: 'display-name',
				label: 'Display name',
				ref: (node: HTMLInputElement | null) => calls.push(node),
			},
		});
		const input = screen.getByRole('textbox', { name: 'Display name' }) as HTMLInputElement;

		expect(calls).toEqual([input]);
		view.unmount();
		expect(calls).toEqual([input, null]);
	});

	it('attaches external and internal refs to the same composed input', () => {
		const inputRef: { current: HTMLInputElement | null } = { current: null };
		const view = render(App, { props: { inputRef } });
		const input = screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement;

		expect(inputRef.current).toBe(input);
		input.focus();
		input.blur();
		expect(document.activeElement).not.toBe(input);

		fireEvent.click(screen.getByRole('button', { name: 'Focus email' }));
		expect(document.activeElement).toBe(input);

		view.unmount();
		expect(inputRef.current).toBeNull();
	});

	it('composes an App-level callback ref and clears it on unmount', () => {
		const calls: Array<HTMLInputElement | null> = [];
		const view = render(App, {
			props: {
				inputRef: (node: HTMLInputElement | null) => calls.push(node),
			},
		});
		const input = screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement;

		expect(calls).toEqual([input]);
		fireEvent.click(screen.getByRole('button', { name: 'Focus email' }));
		expect(document.activeElement).toBe(input);

		view.unmount();
		expect(calls).toEqual([input, null]);
	});
});
