/**
 * Octane-only unpaired conformance for page, remember, poll, and prefetch hooks.
 *
 * Not React-parity evidence: these cases are not cited against a pinned
 * upstream registration and are intentionally outside react-parity ownership
 * (see packages/inertia/UPSTREAM.md). Inspired by Inertia 3.6.1 adapter
 * behavior at 68b13b662d7a6ecdd504026ee18733192b0c7d73, not a case-by-case port.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@octanejs/testing-library';
import { router, usePage, usePoll, usePrefetch, useRemember } from '@octanejs/inertia';
import { PageProvider, setFixturePage } from '../_fixtures/page-provider.tsrx';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('Inertia hooks', () => {
	it('requires usePage to be rendered below the Inertia page context', () => {
		expect(() => renderHook(() => usePage())).toThrow(
			'usePage must be used within the Inertia component',
		);
	});

	it('returns the current page from its provider', () => {
		const page = {
			component: 'Dashboard',
			props: { user: 'Ada' },
			url: '/dashboard',
			version: null,
			clearHistory: false,
			encryptHistory: false,
		};
		setFixturePage(page);
		const { result } = renderHook(() => usePage(), { wrapper: PageProvider });

		expect(result.current).toBe(page);
	});

	it('restores and remembers state while filtering excluded fields', async () => {
		vi.spyOn(router, 'restore').mockReturnValue({ name: 'Grace', token: 'secret' });
		const remember = vi.spyOn(router, 'remember').mockImplementation(() => undefined);
		const excluded = { current: ['token'] };
		const { result } = renderHook(() =>
			useRemember({ name: 'Ada', token: '' }, 'profile', excluded),
		);

		expect(result.current[0]).toEqual({ name: 'Grace', token: 'secret' });
		expect(remember).toHaveBeenLastCalledWith({ name: 'Grace' }, 'profile');

		await act(() => result.current[1]({ name: 'Katherine', token: 'new-secret' }));
		expect(remember).toHaveBeenLastCalledWith({ name: 'Katherine' }, 'profile');
	});

	it('creates and destroys a poll and exposes manual controls', () => {
		const poll = {
			start: vi.fn(),
			stop: vi.fn(),
			destroy: vi.fn(),
		};
		const pollFactory = vi.spyOn(router, 'poll').mockReturnValue(poll);
		const { result, unmount } = renderHook(() => usePoll(5000));

		expect(pollFactory).toHaveBeenCalledWith(5000, {}, { autoStart: true, keepAlive: false });
		result.current.start();
		result.current.stop();
		expect(poll.start).toHaveBeenCalledOnce();
		expect(poll.stop).toHaveBeenCalledOnce();

		unmount();
		expect(poll.destroy).toHaveBeenCalledOnce();
	});

	it('reports cached prefetch state and flushes the current path', () => {
		vi.spyOn(router, 'getCached').mockReturnValue({
			staleTimestamp: 1234,
		} as never);
		vi.spyOn(router, 'getPrefetching').mockReturnValue(null);
		const unsubscribe = vi.fn();
		vi.spyOn(router, 'on').mockReturnValue(unsubscribe);
		const flush = vi.spyOn(router, 'flush').mockImplementation(() => undefined);
		window.history.replaceState({}, '', '/dashboard');

		const { result, unmount } = renderHook(() => usePrefetch({ cacheFor: '1m' }));

		expect(result.current).toMatchObject({
			lastUpdatedAt: 1234,
			isPrefetching: false,
			isPrefetched: true,
		});
		result.current.flush();
		expect(flush).toHaveBeenCalledWith('/dashboard', { cacheFor: '1m' });

		unmount();
		expect(unsubscribe).toHaveBeenCalledTimes(2);
	});
});
