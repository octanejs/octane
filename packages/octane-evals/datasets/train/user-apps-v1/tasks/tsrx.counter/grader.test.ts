import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/tsrx.counter/src/App.tsrx';

afterEach(cleanup);

describe('bounded seat counter', () => {
	it('updates through native clicks and enforces both limits', () => {
		render(App);

		const remove = screen.getByRole('button', { name: 'Remove seat' }) as HTMLButtonElement;
		const add = screen.getByRole('button', { name: 'Add seat' }) as HTMLButtonElement;
		const count = screen.getByLabelText('Seat count');

		expect(count.textContent).toBe('0');
		expect(remove.disabled).toBe(true);
		expect(add.disabled).toBe(false);
		expect(screen.getByText('No seats selected')).toBeTruthy();

		fireEvent.click(add);
		expect(count.textContent).toBe('1');
		expect(screen.getByText('Ready to reserve')).toBeTruthy();

		fireEvent.click(add);
		fireEvent.click(add);
		fireEvent.click(add);
		expect(count.textContent).toBe('3');
		expect(add.disabled).toBe(true);
		expect(screen.getByText('Selection full')).toBeTruthy();

		fireEvent.click(remove);
		fireEvent.click(remove);
		fireEvent.click(remove);
		fireEvent.click(remove);
		expect(count.textContent).toBe('0');
		expect(remove.disabled).toBe(true);
	});
});
