import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/integration.zustand-cart/src/App.tsrx';

afterEach(cleanup);

describe('Zustand shopping cart', () => {
	it('manages totals, line removal, clearing, and remount persistence', () => {
		const first = render(App);
		expect(screen.getByText('Cart empty')).toBeTruthy();
		expect(screen.getByText('Total: £0.00')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Add Coffee' }));
		fireEvent.click(screen.getByRole('button', { name: 'Add Coffee' }));
		fireEvent.click(screen.getByRole('button', { name: 'Add Tea' }));

		expect(screen.getByText('Coffee × 2')).toBeTruthy();
		expect(screen.getByText('Tea × 1')).toBeTruthy();
		expect(screen.getByText('Total: £30.00')).toBeTruthy();

		first.unmount();
		render(App);
		expect(screen.getByText('Coffee × 2')).toBeTruthy();
		expect(screen.getByText('Tea × 1')).toBeTruthy();
		expect(screen.getByText('Total: £30.00')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Decrease Coffee' }));
		expect(screen.getByText('Coffee × 1')).toBeTruthy();
		expect(screen.getByText('Total: £17.50')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Decrease Coffee' }));
		expect(screen.queryByText(/Coffee ×/)).toBeNull();
		expect(screen.getByText('Total: £5.00')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Clear cart' }));
		expect(screen.getByText('Cart empty')).toBeTruthy();
		expect(screen.getByText('Total: £0.00')).toBeTruthy();
	});
});
