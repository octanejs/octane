import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/tsrx.conditional-note/src/App.tsrx';

afterEach(cleanup);

describe('conditional note editor', () => {
	it('skips a hook behind an early return and preserves its state', () => {
		const onSave = vi.fn();
		const view = render(App, { props: { enabled: false, onSave } });

		expect(screen.getByRole('status').textContent).toBe('Notes are disabled');
		expect(screen.queryByRole('textbox')).toBeNull();

		view.rerender({ props: { enabled: true, onSave } });
		const textarea = screen.getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement;
		const save = screen.getByRole('button', { name: 'Save note' }) as HTMLButtonElement;
		expect(textarea.value).toBe('');
		expect(save.disabled).toBe(true);

		fireEvent.input(textarea, { target: { value: '  Meet at 4  ' } });
		expect(textarea.value).toBe('  Meet at 4  ');
		expect(screen.getByLabelText('Character count').textContent).toBe('13 / 80');
		expect(save.disabled).toBe(false);

		fireEvent.click(save);
		expect(onSave).toHaveBeenCalledTimes(1);
		expect(onSave).toHaveBeenCalledWith('Meet at 4');

		view.rerender({ props: { enabled: false, onSave } });
		expect(screen.getByRole('status').textContent).toBe('Notes are disabled');
		expect(screen.queryByRole('textbox')).toBeNull();

		view.rerender({ props: { enabled: true, onSave } });
		expect((screen.getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement).value).toBe(
			'  Meet at 4  ',
		);
	});
});
