// Per packages/oidc-context/upstream/canonical/test/useAuth.test.tsx
import { renderHook, waitFor } from '@octanejs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../src/useAuth';
import { createWrapper } from './helpers';

vi.mock('oidc-client-ts', function () {
	return import('./_mocks/oidc-client-ts');
});

const settingsStub = {
	authority: 'authority',
	client_id: 'client',
	redirect_uri: 'redirect',
};

describe('useAuth', function () {
	it('should provide the auth context', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(function useAuthHook() {
			return useAuth();
		}, { wrapper });

		await waitFor(function () {
			expect(result.current).toBeDefined();
		});
	});

	it('should return undefined with no provider', async function () {
		const { result } = renderHook(function useAuthHook() {
			return useAuth();
		});
		expect(result.current).toBeUndefined();
	});
});
