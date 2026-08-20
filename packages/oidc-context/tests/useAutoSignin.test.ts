// Per packages/oidc-context/upstream/canonical/test/useAutoSignin.test.tsx
import { renderHook, waitFor } from '@octanejs/testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserManager } from 'oidc-client-ts';
import { useAutoSignin } from '../src/useAutoSignin';
import type { AuthProviderProps } from '../src';
import { createWrapper } from './helpers';

vi.mock('oidc-client-ts', function () {
	return import('./_mocks/oidc-client-ts');
});

const settingsStub: AuthProviderProps = {
	authority: 'authority',
	client_id: 'client',
	redirect_uri: 'redirect',
};

describe('useAutoSignin', function () {
	beforeEach(function () {
		vi.clearAllMocks();
	});

	it('should auto sign in using default signinRedirect', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(
			function hook() {
				return useAutoSignin();
			},
			{ wrapper },
		);

		await waitFor(function () {
			expect(result.current).toBeDefined();
		});

		expect(UserManager.prototype.signinRedirect).toHaveBeenCalled();
		expect(UserManager.prototype.getUser).toHaveBeenCalled();
	});

	it('should auto sign in using provided method signinRedirect', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(
			function hook() {
				return useAutoSignin({ signinMethod: 'signinRedirect' });
			},
			{ wrapper },
		);

		await waitFor(function () {
			expect(result.current).toBeDefined();
		});

		expect(UserManager.prototype.signinRedirect).toHaveBeenCalled();
		expect(UserManager.prototype.getUser).toHaveBeenCalled();
	});

	it('should auto sign in using provided method signinPopup', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(
			function hook() {
				return useAutoSignin({ signinMethod: 'signinPopup' });
			},
			{ wrapper },
		);

		await waitFor(function () {
			expect(result.current).toBeDefined();
		});

		expect(UserManager.prototype.signinPopup).toHaveBeenCalled();
		expect(UserManager.prototype.getUser).toHaveBeenCalled();
	});

	it('should auto sign and not call signinRedirect if other method provided', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(
			function hook() {
				return useAutoSignin({ signinMethod: 'signinPopup' });
			},
			{ wrapper },
		);

		await waitFor(function () {
			expect(result.current).toBeDefined();
		});

		expect(UserManager.prototype.signinRedirect).not.toHaveBeenCalled();
		expect(UserManager.prototype.getUser).toHaveBeenCalled();
	});

	it('should pass signinArgs to signinRedirect when provided', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const redirectArgs = {
			redirect_uri: 'custom_redirect',
			state: 'custom_state',
		};
		const { result } = renderHook(
			function hook() {
				return useAutoSignin({
					signinMethod: 'signinRedirect',
					signinArgs: redirectArgs,
				});
			},
			{ wrapper },
		);

		await waitFor(function () {
			expect(result.current).toBeDefined();
		});

		expect(UserManager.prototype.signinRedirect).toHaveBeenCalledWith(redirectArgs);
	});

	it('should pass signinArgs to signinPopup when provided', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const popupArgs = {
			redirect_uri: 'custom_popup_redirect',
			popupWindowFeatures: {
				width: 500,
				height: 600,
			},
			extraQueryParams: { foo: 'bar' },
		};
		const { result } = renderHook(
			function hook() {
				return useAutoSignin({
					signinMethod: 'signinPopup',
					signinArgs: popupArgs,
				});
			},
			{ wrapper },
		);

		await waitFor(function () {
			expect(result.current).toBeDefined();
		});

		expect(UserManager.prototype.signinPopup).toHaveBeenCalledWith(popupArgs);
	});

	it('should pass signinArgs to signinRedirect when using default method', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const redirectArgs = {
			redirect_uri: 'default_method_redirect',
			extraQueryParams: { foo: 'bar' },
		};
		const { result } = renderHook(
			function hook() {
				return useAutoSignin({
					signinArgs: redirectArgs,
				});
			},
			{ wrapper },
		);

		await waitFor(function () {
			expect(result.current).toBeDefined();
		});

		expect(UserManager.prototype.signinRedirect).toHaveBeenCalledWith(redirectArgs);
	});

	it('should call signinRedirect without signinArgs when no signinArgs provided', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(
			function hook() {
				return useAutoSignin({
					signinMethod: 'signinRedirect',
				});
			},
			{ wrapper },
		);

		await waitFor(function () {
			expect(result.current).toBeDefined();
		});

		expect(UserManager.prototype.signinRedirect).toHaveBeenCalledWith(undefined);
	});

	it('should call signinPopup without signinArgs when no signinArgs provided', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(
			function hook() {
				return useAutoSignin({
					signinMethod: 'signinPopup',
				});
			},
			{ wrapper },
		);

		await waitFor(function () {
			expect(result.current).toBeDefined();
		});

		expect(UserManager.prototype.signinPopup).toHaveBeenCalledWith(undefined);
	});
});
