// Per packages/oidc-context/upstream/canonical/test/SSR.test.tsx
// @vitest-environment node
import { renderHook } from '@octanejs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../src/useAuth';
import { createWrapper } from './helpers';

vi.mock('oidc-client-ts', function () {
	return import('./_mocks/oidc-client-ts');
});

describe('In a Node SSR environment', function () {
	it('auth state is initialised', async function () {
		const wrapper = createWrapper({
			authority: 'authority',
			client_id: 'client',
			redirect_uri: 'redirect',
		});

		const { result } = renderHook(function useAuthHook() {
			return useAuth();
		}, { wrapper });

		expect(result.current.isLoading).toBeTruthy();
		expect(result.current.isAuthenticated).toBeFalsy();
		expect(result.current.user).toBeUndefined();
	});
});
