import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/octane.reducer-wizard/src/App.tsrx';

afterEach(cleanup);

function submitAndExpectPrevented(form: HTMLElement): void {
	const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
	fireEvent(form, event);
	expect(event.defaultPrevented).toBe(true);
}

describe('reducer-driven account wizard', () => {
	it('updates controlled fields and retains reducer state while moving between composed steps', () => {
		const onConfirm = vi.fn();
		render(App, { props: { onConfirm } });

		const name = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
		const choosePlan = screen.getByRole('button', { name: 'Choose plan' }) as HTMLButtonElement;
		expect(name.value).toBe('');
		expect(choosePlan.disabled).toBe(true);

		fireEvent.input(name, { target: { value: '   ' } });
		expect(choosePlan.disabled).toBe(true);
		fireEvent.input(name, { target: { value: '  Ada Lovelace  ' } });
		expect(name.value).toBe('  Ada Lovelace  ');
		expect(choosePlan.disabled).toBe(false);
		submitAndExpectPrevented(screen.getByRole('form', { name: 'Profile step' }));

		const plan = screen.getByRole('combobox', { name: 'Plan' }) as HTMLSelectElement;
		expect(plan.value).toBe('starter');
		fireEvent.change(plan, { target: { value: 'pro' } });
		expect(plan.value).toBe('pro');
		submitAndExpectPrevented(screen.getByRole('form', { name: 'Plan step' }));

		expect(screen.getByLabelText('Review name').textContent).toBe('Ada Lovelace');
		expect(screen.getByLabelText('Review plan').textContent).toBe('Pro');

		fireEvent.click(screen.getByRole('button', { name: 'Back' }));
		expect((screen.getByRole('combobox', { name: 'Plan' }) as HTMLSelectElement).value).toBe('pro');
		fireEvent.click(screen.getByRole('button', { name: 'Back' }));
		expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe(
			'  Ada Lovelace  ',
		);
	});

	it('confirms the trimmed name and selected plan', () => {
		const onConfirm = vi.fn();
		render(App, { props: { onConfirm } });

		fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), {
			target: { value: '  Grace Hopper ' },
		});
		fireEvent.submit(screen.getByRole('form', { name: 'Profile step' }));
		fireEvent.change(screen.getByRole('combobox', { name: 'Plan' }), {
			target: { value: 'pro' },
		});
		fireEvent.submit(screen.getByRole('form', { name: 'Plan step' }));
		fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

		expect(onConfirm).toHaveBeenCalledOnce();
		expect(onConfirm).toHaveBeenCalledWith({ name: 'Grace Hopper', plan: 'pro' });
	});
});
