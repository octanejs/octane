/**
 * Octane-only unpaired conformance for useForm / useHttp state contracts.
 *
 * Not React-parity evidence: these cases are not cited against a pinned
 * upstream registration and are intentionally outside react-parity ownership
 * (see packages/inertia/UPSTREAM.md). Inspired by Inertia 3.6.1 behavior at
 * 68b13b662d7a6ecdd504026ee18733192b0c7d73, not a case-by-case port.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@octanejs/testing-library';
import { http, useForm, useHttp } from '@octanejs/inertia';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('useForm state', () => {
	it('tracks nested data, dirtiness, defaults, and field resets', async () => {
		const { result } = renderHook(() =>
			useForm({
				name: 'Ada',
				address: { city: 'London' },
			}),
		);

		expect(result.current.isDirty).toBe(false);

		await act(() => result.current.setData('address.city', 'Paris'));
		expect(result.current.data.address.city).toBe('Paris');
		expect(result.current.isDirty).toBe(true);

		await act(() => result.current.reset('address.city'));
		expect(result.current.data.address.city).toBe('London');
		expect(result.current.isDirty).toBe(false);
	});

	it('sets, clears, and resets validation errors independently', async () => {
		const { result } = renderHook(() => useForm({ email: '', name: '' }));

		await act(() => {
			result.current.setData({ email: 'ada@example.test', name: 'Ada' });
			result.current.setError({
				email: 'The email is invalid.',
				name: 'The name is unavailable.',
			});
		});
		expect(result.current.hasErrors).toBe(true);

		await act(() => result.current.clearErrors('email'));
		expect(result.current.errors).toEqual({ name: 'The name is unavailable.' });

		await act(() => result.current.resetAndClearErrors());
		expect(result.current.data).toEqual({ email: '', name: '' });
		expect(result.current.errors).toEqual({});
	});

	it('supports functional updates and promotes current data to defaults', async () => {
		const { result } = renderHook(() => useForm({ count: 1 }));

		await act(() => result.current.setData((data) => ({ count: data.count + 1 })));
		expect(result.current.data.count).toBe(2);
		expect(result.current.isDirty).toBe(true);

		await act(() => result.current.setDefaults());
		expect(result.current.isDirty).toBe(false);

		await act(() => result.current.setData('count', 3));
		await act(() => result.current.reset());
		expect(result.current.data.count).toBe(2);
	});
});

describe('useHttp state', () => {
	it('serializes JSON requests and commits successful response state', async () => {
		const request = vi.fn().mockResolvedValue({
			status: 201,
			data: JSON.stringify({ id: 42 }),
			headers: {},
		});
		vi.spyOn(http, 'getClient').mockReturnValue({ request } as never);
		const { result } = renderHook(() => useHttp<{ name: string }, { id: number }>({ name: 'Ada' }));

		let response: { id: number } | undefined;
		await act(async () => {
			response = await result.current.post('/people');
		});

		expect(request).toHaveBeenCalledWith(
			expect.objectContaining({
				method: 'post',
				url: '/people',
				data: JSON.stringify({ name: 'Ada' }),
				headers: expect.objectContaining({
					Accept: 'application/json',
					'Content-Type': 'application/json',
				}),
			}),
		);
		expect(response).toEqual({ id: 42 });
		expect(result.current.response).toEqual({ id: 42 });
		expect(result.current.wasSuccessful).toBe(true);
		expect(result.current.processing).toBe(false);
	});

	it('merges GET data into the query string without a request body', async () => {
		const request = vi.fn().mockResolvedValue({
			status: 200,
			data: JSON.stringify({ ok: true }),
			headers: {},
		});
		vi.spyOn(http, 'getClient').mockReturnValue({ request } as never);
		const { result } = renderHook(() => useHttp({ search: 'octane', page: 2 }));

		await act(() => result.current.get('/people'));

		expect(request).toHaveBeenCalledWith(
			expect.objectContaining({
				method: 'get',
				url: '/people?search=octane&page=2',
				data: undefined,
			}),
		);
	});
});
