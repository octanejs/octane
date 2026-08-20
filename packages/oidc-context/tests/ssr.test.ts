// Per packages/oidc-context/upstream/canonical/test/SSR.test.tsx
// @vitest-environment node
import { Window } from 'happy-dom';
import { renderHook } from '@octanejs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../src/useAuth';
import { createWrapper } from './helpers';

vi.mock('oidc-client-ts', function () {
	return import('./_mocks/oidc-client-ts');
});

describe('In a Node SSR environment', function () {
	it('auth state is initialised', async function () {
		// OCTANE DIVERGENCE: testing-library still needs a document to mount.
		// Keep `window` undefined so AuthProvider takes the SSR UserManager stub.
		const happy = new Window();
		(globalThis as { document?: Document }).document = happy.document as unknown as Document;

		const wrapper = createWrapper({
			authority: 'authority',
			client_id: 'client',
			redirect_uri: 'redirect',
		});

		const { result } = renderHook(
			function useAuthHook() {
				return useAuth();
			},
			{ wrapper },
		);

		// OCTANE DIVERGENCE: renderHook records after the initialize effect. The
		// settings-only SSR stub has no getUser, so the error path clears isLoading
		// in the same turn instead of leaving the pre-init true value.
		expect(result.current.isLoading).toBeFalsy();
		expect(result.current.isAuthenticated).toBeFalsy();
		expect(result.current.user).toBeUndefined();
	});
});
