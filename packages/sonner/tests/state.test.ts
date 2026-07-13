import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@octanejs/sonner';

afterEach(() => {
	toast.dismiss();
});

describe('@octanejs/sonner — imperative state', () => {
	it('exposes every upstream callable method and preserves id/history semantics', () => {
		for (const method of [
			'success',
			'info',
			'warning',
			'error',
			'custom',
			'message',
			'promise',
			'dismiss',
			'loading',
			'getHistory',
			'getToasts',
		]) {
			expect(typeof (toast as any)[method]).toBe('function');
		}

		const id = toast('Initial', { id: 'state-contract', duration: Infinity });
		expect(id).toBe('state-contract');
		toast.error('Updated', { id, duration: Infinity });
		const matching = toast.getHistory().filter((item) => item.id === id);
		expect(matching).toHaveLength(1);
		expect(matching[0]).toMatchObject({ id, title: 'Updated', type: 'error' });
	});

	it('does not reject promise() unless unwrap() is requested', async () => {
		const rejection = Promise.reject(new Error('promise rejected'));
		const result = toast.promise(rejection, {});
		await expect(result.unwrap()).rejects.toThrow('promise rejected');
	});

	it('handles Error results and rejected promises through error callbacks', async () => {
		const errorMessage = vi.fn((error: unknown) => `Error: ${String(error)}`);
		const resolvedError = toast.promise(Promise.resolve(new Error('resolved error')), {
			id: 'resolved-error',
			error: errorMessage,
		});
		await expect(resolvedError.unwrap()).resolves.toEqual(new Error('resolved error'));
		expect(errorMessage).toHaveBeenCalled();

		const rejected = toast.promise(Promise.reject('rejected value'), {
			id: 'rejected-error',
			error: errorMessage,
		});
		await expect(rejected.unwrap()).rejects.toBe('rejected value');
	});

	it('publishes a custom toast under the id it returns when an optional id is undefined', () => {
		const id = toast.custom(() => ({}) as any, { id: undefined, duration: Infinity });
		const published = toast.getHistory().find((item) => item.id === id);

		expect(published).toMatchObject({ id });
	});

	it('removes every dismissed toast from the active toast collection', () => {
		const first = toast.success('First', { id: 'dismiss-all-first', duration: Infinity });
		const second = toast.error('Second', { id: 'dismiss-all-second', duration: Infinity });
		expect(toast.getToasts().map((item) => item.id)).toEqual(
			expect.arrayContaining([first, second]),
		);

		toast.dismiss();

		expect(toast.getToasts().map((item) => item.id)).not.toEqual(
			expect.arrayContaining([first, second]),
		);
	});
});
