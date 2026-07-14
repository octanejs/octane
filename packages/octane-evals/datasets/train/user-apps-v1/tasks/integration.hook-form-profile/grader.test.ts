import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/integration.hook-form-profile/src/App.tsrx';

afterEach(cleanup);

describe('Hook Form profile editor', () => {
	it('validates native input events and submits only valid profile data', async () => {
		const onSave = vi.fn();
		render(App, { props: { onSave } });

		fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
		await waitFor(() => {
			expect(screen.getByText('Name is required')).toBeTruthy();
			expect(screen.getByText('Email is required')).toBeTruthy();
		});
		expect(onSave).not.toHaveBeenCalled();

		fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'ada@' } });
		await waitFor(() => expect(screen.getByText('Enter a valid email')).toBeTruthy());
		expect(onSave).not.toHaveBeenCalled();

		fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Ada Lovelace' } });
		fireEvent.input(screen.getByLabelText('Email'), {
			target: { value: 'ada@example.com' },
		});
		await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());

		fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
		await waitFor(() =>
			expect(onSave).toHaveBeenCalledWith({
				name: 'Ada Lovelace',
				email: 'ada@example.com',
			}),
		);
		expect(onSave).toHaveBeenCalledTimes(1);
	});
});
