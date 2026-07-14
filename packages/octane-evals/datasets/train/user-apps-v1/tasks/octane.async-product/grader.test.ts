import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@octanejs/testing-library';
import { App, type Product } from '@octane-eval-submission/octane.async-product/src/App.tsrx';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

afterEach(cleanup);

describe('octane.async-product', () => {
	it('shows pending content, resolves, and starts one request per product ID', async () => {
		const first = deferred<Product>();
		const second = deferred<Product>();
		const requests = new Map([
			['p-1', first.promise],
			['p-2', second.promise],
		]);
		const loadProduct = vi.fn((id: string) => requests.get(id)!);

		const view = render(App, { props: { productId: 'p-1', loadProduct } });
		expect(view.container.querySelector('.loading')?.textContent).toBe('Loading product…');
		expect(view.container.querySelector('.product')).toBeNull();
		expect(loadProduct.mock.calls).toEqual([['p-1']]);

		await act(() => {
			first.resolve({ id: 'p-1', name: 'Desk lamp', priceCents: 1234 });
		});
		expect(view.container.querySelector('.loading')).toBeNull();
		expect(view.container.querySelector('.product')?.getAttribute('data-product-id')).toBe('p-1');
		expect(view.container.querySelector('h2')?.textContent).toBe('Desk lamp');
		expect(view.container.querySelector('.price')?.textContent).toBe('$12.34');

		view.rerender({ props: { productId: 'p-1', loadProduct } });
		expect(loadProduct.mock.calls).toEqual([['p-1']]);
		expect(view.container.querySelector('h2')?.textContent).toBe('Desk lamp');

		view.rerender({ props: { productId: 'p-2', loadProduct } });
		expect(view.container.querySelector('.loading')?.textContent).toBe('Loading product…');
		expect(view.container.querySelector('.product')).toBeNull();
		expect(loadProduct.mock.calls).toEqual([['p-1'], ['p-2']]);

		await act(() => {
			second.resolve({ id: 'p-2', name: 'Reading chair', priceCents: 5099 });
		});
		expect(view.container.querySelector('h2')?.textContent).toBe('Reading chair');
		expect(view.container.querySelector('.price')?.textContent).toBe('$50.99');
	});

	it('routes a rejected request to the catch arm', async () => {
		const request = deferred<Product>();
		const loadProduct = vi.fn(() => request.promise);
		const view = render(App, { props: { productId: 'broken', loadProduct } });

		expect(view.container.querySelector('.loading')).not.toBeNull();
		await act(() => {
			request.reject(new Error('Product service unavailable'));
		});

		const alert = view.container.querySelector('[role="alert"]');
		expect(alert?.classList.contains('error')).toBe(true);
		expect(alert?.textContent).toBe('Product service unavailable');
		expect(view.container.querySelector('.loading')).toBeNull();
		expect(view.container.querySelector('.product')).toBeNull();
	});

	it('stringifies non-Error rejection values in the catch arm', async () => {
		const request = deferred<Product>();
		const loadProduct = vi.fn(() => request.promise);
		const rejection = { code: 503, toString: () => 'Product lookup failed (503)' };
		const view = render(App, { props: { productId: 'missing', loadProduct } });

		expect(view.container.querySelector('.loading')).not.toBeNull();
		await act(() => {
			request.reject(rejection);
		});

		const alert = view.container.querySelector('[role="alert"]');
		expect(alert?.classList.contains('error')).toBe(true);
		expect(alert?.textContent).toBe(String(rejection));
		expect(view.container.querySelector('.loading')).toBeNull();
		expect(view.container.querySelector('.product')).toBeNull();
	});
});
