import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/octane.native-change-intent/src/App.tsrx';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('octane.native-change-intent', () => {
	it('keeps per-edit text behavior distinct from deliberate native commits', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		render(App);
		const title = screen.getByRole('textbox', { name: 'Live title' }) as HTMLInputElement;
		const draft = screen.getByRole('textbox', { name: 'Draft note' }) as HTMLInputElement;

		expect(screen.getByLabelText('Live title value').textContent).toBe('Empty');
		fireEvent.input(title, { target: { value: 'Launch notes' } });
		expect(screen.getByLabelText('Live title value').textContent).toBe('Launch notes');

		expect(draft.value).toBe('Initial draft');
		expect(screen.getByLabelText('Last saved draft').textContent).toBe('Nothing committed yet');
		fireEvent.input(draft, { target: { value: 'Review on Friday' } });
		expect(draft.value).toBe('Review on Friday');
		expect(screen.getByLabelText('Last saved draft').textContent).toBe('Nothing committed yet');
		fireEvent.change(draft, { target: { value: 'Review on Friday' } });
		expect(screen.getByLabelText('Last saved draft').textContent).toBe('Review on Friday');
		expect(errorSpy.mock.calls).toEqual([]);
	});

	it('retains legitimate native onChange and component callbacks without diagnostics', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		render(App);

		fireEvent.change(screen.getByRole('combobox', { name: 'Plan' }), {
			target: { value: 'pro' },
		});
		expect(screen.getByLabelText('Selected plan').textContent).toBe('Pro');

		fireEvent.click(screen.getByRole('checkbox', { name: 'Email alerts' }));
		expect(screen.getByLabelText('Alert status').textContent).toBe('enabled');

		fireEvent.click(screen.getByRole('button', { name: 'Choose compact' }));
		expect(screen.getByLabelText('Layout').textContent).toBe('compact');

		fireEvent.input(screen.getByRole('textbox', { name: 'Dynamic alias' }), {
			target: { value: 'octane-user' },
		});
		expect(screen.getByLabelText('Dynamic alias value').textContent).toBe('octane-user');
		expect(errorSpy.mock.calls).toEqual([]);
	});
});
