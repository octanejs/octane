import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/tsrx.packing-list/src/App.tsrx';

afterEach(cleanup);

describe('interactive packing list', () => {
	it('adds, packs, and removes stable keyed rows through native events', () => {
		render(App);

		const input = screen.getByLabelText('Packing item') as HTMLInputElement;
		const form = screen.getByRole('form', { name: 'Add packing item' });

		expect(screen.getByLabelText('Packing summary').textContent).toBe('1 unpacked');
		expect(screen.getByText('Passport')).toBeTruthy();

		fireEvent.input(input, { target: { value: '   ' } });
		fireEvent.submit(form);
		expect(screen.getAllByRole('listitem')).toHaveLength(1);

		fireEvent.input(input, { target: { value: '  Socks  ' } });
		fireEvent.submit(form);
		expect(input.value).toBe('');
		expect(screen.getByLabelText('Packing summary').textContent).toBe('2 unpacked');
		const socksRow = screen.getByText('Socks').closest('li');
		expect(socksRow).not.toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Remove Passport' }));
		expect(screen.queryByText('Passport')).toBeNull();
		expect(screen.getByText('Socks').closest('li')).toBe(socksRow);

		fireEvent.click(screen.getByRole('button', { name: 'Pack Socks' }));
		expect(socksRow!.classList.contains('packed')).toBe(true);
		expect(screen.getByLabelText('Packing summary').textContent).toBe('0 unpacked');
		expect(screen.getByRole('button', { name: 'Unpack Socks' })).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Remove Socks' }));
		expect(screen.getByText('No items to pack')).toBeTruthy();
		expect(screen.getByLabelText('Packing summary').textContent).toBe('0 unpacked');
	});

	it('keeps duplicate labels as distinct, stable keyed rows', () => {
		render(App);
		const input = screen.getByLabelText('Packing item') as HTMLInputElement;
		const form = screen.getByRole('form', { name: 'Add packing item' });

		for (let index = 0; index < 2; index++) {
			fireEvent.input(input, { target: { value: 'Socks' } });
			fireEvent.submit(form);
		}

		const socksRows = screen
			.getAllByText('Socks')
			.map((label) => label.closest('li') as HTMLLIElement);
		expect(socksRows).toHaveLength(2);
		expect(socksRows[0]).not.toBe(socksRows[1]);

		fireEvent.click(within(socksRows[0]).getByRole('button', { name: 'Pack Socks' }));
		expect(socksRows[0].classList.contains('packed')).toBe(true);
		expect(socksRows[1].classList.contains('packed')).toBe(false);

		fireEvent.click(screen.getByRole('button', { name: 'Remove Passport' }));
		const rowsAfterLeadingRemoval = screen
			.getAllByText('Socks')
			.map((label) => label.closest('li'));
		expect(rowsAfterLeadingRemoval).toEqual(socksRows);

		fireEvent.click(within(socksRows[0]).getByRole('button', { name: 'Remove Socks' }));
		expect(screen.getByText('Socks').closest('li')).toBe(socksRows[1]);
		expect(socksRows[1].classList.contains('packed')).toBe(false);
	});
});
