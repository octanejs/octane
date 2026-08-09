/**
 * Adapted Octane runtime evidence for usePage against the pinned
 * `@inertiajs/react@3.6.1` source at
 * `packages/inertia/upstream/src/usePage.ts`
 * (commit 68b13b662d7a6ecdd504026ee18733192b0c7d73).
 *
 * Citations (upstream source lines; upstream ships no unit suite for this
 * module):
 * - throw outside provider: usePage.ts:9-11
 * - return current context page: usePage.ts:6-13
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook } from '@octanejs/testing-library';
import { usePage } from '@octanejs/inertia';
import { PageProvider, setFixturePage } from '../_fixtures/page-provider.tsrx';

afterEach(() => {
	cleanup();
});

describe('adapted usePage', () => {
	// @parity-case adapted:use-page-requires-provider
	it('throws when rendered outside the Inertia page context', () => {
		expect(function () {
			renderHook(() => usePage());
		}).toThrow('usePage must be used within the Inertia component');
	});

	// @parity-case adapted:use-page-returns-context
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
});
