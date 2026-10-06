import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/octane.inferred-hook-deps/src/App.tsrx';

afterEach(cleanup);

describe('inferred hook dependencies', () => {
	it('recomputes captured values and resubscribes to a replacement callback', async () => {
		// Each observer reaches the component as an arrow, as a parent passes a
		// callback. `props.onTotal(total)` passes the props object as `this`, and a
		// `vi.fn()` is an ordinary function that records `this`, so passing one
		// directly would make every rebuilt props object a real dependency.
		const firstObserver = vi.fn();
		const onFirstTotal = (total: number) => firstObserver(total);
		const view = render(App, {
			props: { quantity: 2, unitPrice: 12.5, discount: 5, onTotal: onFirstTotal },
		});

		expect(screen.getByLabelText('Quantity').textContent).toBe('2');
		expect(screen.getByLabelText('Subtotal').textContent).toBe('25.00');
		expect(screen.getByLabelText('Total').textContent).toBe('20.00');
		await waitFor(() => expect(firstObserver).toHaveBeenLastCalledWith(20));
		expect(firstObserver).toHaveBeenCalledOnce();

		view.rerender({
			props: { quantity: 2, unitPrice: 12.5, discount: 5, onTotal: onFirstTotal },
		});
		expect(screen.getByLabelText('Total').textContent).toBe('20.00');
		expect(firstObserver).toHaveBeenCalledOnce();

		view.rerender({
			props: { quantity: 3, unitPrice: 12.5, discount: 5, onTotal: onFirstTotal },
		});
		expect(screen.getByLabelText('Quantity').textContent).toBe('3');
		expect(screen.getByLabelText('Subtotal').textContent).toBe('37.50');
		expect(screen.getByLabelText('Total').textContent).toBe('32.50');
		await waitFor(() => expect(firstObserver).toHaveBeenLastCalledWith(32.5));

		view.rerender({
			props: { quantity: 3, unitPrice: 12.5, discount: 50, onTotal: onFirstTotal },
		});
		expect(screen.getByLabelText('Subtotal').textContent).toBe('37.50');
		expect(screen.getByLabelText('Total').textContent).toBe('0.00');
		await waitFor(() => expect(firstObserver).toHaveBeenLastCalledWith(0));

		const replacementObserver = vi.fn();
		const onReplacementTotal = (total: number) => replacementObserver(total);
		view.rerender({
			props: { quantity: 3, unitPrice: 12.5, discount: 50, onTotal: onReplacementTotal },
		});
		await waitFor(() => expect(replacementObserver).toHaveBeenCalledOnce());
		expect(replacementObserver).toHaveBeenCalledWith(0);
	});
});
