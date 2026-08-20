// Per packages/oidc-context/upstream/canonical/test/AuthProvider.test.tsx
import { act, renderHook, waitFor } from '@octanejs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { UserManager, type User } from 'oidc-client-ts';
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
const user = { id_token: '__test_user__' } as User;

describe('AuthProvider', function () {
	it('should signinRedirect when asked', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(function useAuthHook() {
			return useAuth();
		}, { wrapper });

		await waitFor(function () {
			expect(result.current.user).toBeUndefined();
		});

		await act(function () {
			return result.current.signinRedirect();
		});

		expect(UserManager.prototype.signinRedirect).toHaveBeenCalled();
		expect(UserManager.prototype.getUser).toHaveBeenCalled();
	});

	it('should handle signinCallback success and call onSigninCallback', async function () {
		const onSigninCallback = vi.fn();
		window.history.pushState(
			{},
			document.title,
			'/?code=__test_code__&state=__test_state__',
		);
		expect(window.location.href).toBe(
			'https://www.example.com/?code=__test_code__&state=__test_state__',
		);

		const wrapper = createWrapper({ ...settingsStub, onSigninCallback });

		act(function () {
			renderHook(function useAuthHook() {
				return useAuth();
			}, { wrapper });
		});

		await waitFor(function () {
			expect(onSigninCallback).toHaveBeenCalledTimes(1);
		});
		expect(UserManager.prototype.signinCallback).toHaveBeenCalledTimes(1);
	});

	it('should run onSigninCallback only once in StrictMode', async function () {
		// OCTANE DIVERGENCE: Octane has no StrictMode double-invoke; didInitialize still runs once.
		const onSigninCallback = vi.fn();
		window.history.pushState(
			{},
			document.title,
			'/?code=__test_code__&state=__test_state__',
		);
		expect(window.location.href).toBe(
			'https://www.example.com/?code=__test_code__&state=__test_state__',
		);

		const wrapper = createWrapper({ ...settingsStub, onSigninCallback });

		act(function () {
			renderHook(function useAuthHook() {
				return useAuth();
			}, { wrapper });
		});

		await waitFor(function () {
			expect(onSigninCallback).toHaveBeenCalledTimes(1);
		});
		expect(UserManager.prototype.signinCallback).toHaveBeenCalledTimes(1);
	});

	it('should handle signinCallback errors and call onSigninCallback', async function () {
		const onSigninCallback = vi.fn();
		window.history.pushState(
			{},
			document.title,
			'/?error=__test_error__&state=__test_state__',
		);
		expect(window.location.href).toBe(
			'https://www.example.com/?error=__test_error__&state=__test_state__',
		);

		const wrapper = createWrapper({ ...settingsStub, onSigninCallback });

		act(function () {
			renderHook(function useAuthHook() {
				return useAuth();
			}, { wrapper });
		});

		await waitFor(function () {
			expect(onSigninCallback).toHaveBeenCalledTimes(1);
		});
		expect(UserManager.prototype.signinCallback).toHaveBeenCalledTimes(1);
	});

	it('should handle signoutCallback success and call onSignoutCallback', async function () {
		const onSignoutCallback = vi.fn();
		window.history.pushState({}, document.title, '/signout-callback');
		expect(window.location.pathname).toBe('/signout-callback');

		const wrapper = createWrapper({
			...settingsStub,
			post_logout_redirect_uri: 'https://www.example.com/signout-callback',
			matchSignoutCallback: function match() {
				return window.location.pathname === '/signout-callback';
			},
			onSignoutCallback,
		});

		act(function () {
			renderHook(function useAuthHook() {
				return useAuth();
			}, { wrapper });
		});

		await waitFor(function () {
			expect(onSignoutCallback).toHaveBeenCalledTimes(1);
		});
		expect(UserManager.prototype.signoutCallback).toHaveBeenCalledTimes(1);
	});

	it('should handle error when signoutCallback throws Error', async function () {
		const error = new TypeError('expected');
		function onSignoutCallback() {
			throw error;
		}
		window.history.pushState({}, document.title, '/signout-callback');
		expect(window.location.pathname).toBe('/signout-callback');

		const wrapper = createWrapper({
			...settingsStub,
			post_logout_redirect_uri: 'https://www.example.com/signout-callback',
			matchSignoutCallback: function match() {
				return window.location.pathname === '/signout-callback';
			},
			onSignoutCallback,
		});

		const result = await act(async function () {
			const rendered = renderHook(function useAuthHook() {
				return useAuth();
			}, { wrapper });
			return rendered.result;
		});

		await act(async function () {
			await waitFor(function () {
				expect(result.current.user).toBeUndefined();
			});
		});

		expect(result.current.error).toBeTruthy();
		const { toString, ...actual } = result.current.error as unknown as Record<string, unknown>;
		expect(actual).toEqual({
			name: error.name,
			message: error.message,
			innerError: error,
			stack: error.stack,
			source: 'signoutCallback',
		});
		expect(toString?.()).toEqual('TypeError: expected');
	});

	it('should signinResourceOwnerCredentials when asked', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(function useAuthHook() {
			return useAuth();
		}, { wrapper });

		await waitFor(function () {
			expect(result.current.user).toBeUndefined();
		});

		await act(function () {
			return result.current.signinResourceOwnerCredentials({
				username: 'username',
				password: 'password',
				skipUserInfo: false,
			});
		});

		expect(UserManager.prototype.signinResourceOwnerCredentials).toHaveBeenCalled();
		expect(UserManager.prototype.getUser).toHaveBeenCalled();
	});

	it('should handle removeUser and call onRemoveUser', async function () {
		const onRemoveUser = vi.fn();
		const wrapper = createWrapper({ ...settingsStub, onRemoveUser });
		const { result } = renderHook(function useAuthHook() {
			return useAuth();
		}, { wrapper });

		await act(function () {
			return result.current.removeUser();
		});

		await waitFor(function () {
			expect(onRemoveUser).toHaveBeenCalled();
		});
		expect(UserManager.prototype.removeUser).toHaveBeenCalled();
	});

	it('should handle signoutSilent', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(function useAuthHook() {
			return useAuth();
		}, { wrapper });

		await act(function () {
			return result.current.signoutSilent();
		});

		expect(UserManager.prototype.signoutSilent).toHaveBeenCalled();
	});

	it('should get the user', async function () {
		const mockGetUser = vi.mocked(UserManager.prototype.getUser).mockImplementation(function resolveUser() {
			return new Promise(function (resolve) {
				resolve(user);
			});
		});

		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(function useAuthHook() {
			return useAuth();
		}, { wrapper });

		await waitFor(function () {
			expect(UserManager.prototype.getUser).toHaveBeenCalled();
		});

		await waitFor(function () {
			expect(result.current.user).toBe(user);
		});

		mockGetUser.mockRestore();
	});

	it('should allow passing a custom UserManager', async function () {
		const customUserManager = new UserManager({ ...settingsStub });
		customUserManager.signinRedirect = vi.fn().mockResolvedValue(undefined);

		const wrapper = createWrapper({
			userManager: customUserManager,
		});

		const result = await act(async function () {
			const rendered = renderHook(function useAuthHook() {
				return useAuth();
			}, { wrapper });
			return rendered.result;
		});

		await act(async function () {
			await waitFor(function () {
				expect(result.current.user).toBeUndefined();
			});
		});

		await act(async function () {
			await result.current.signinRedirect();
		});

		expect(UserManager.prototype.signinRedirect).not.toHaveBeenCalled();
		expect(customUserManager.signinRedirect).toHaveBeenCalled();
	});

	it('should handle errors of signinRedirect', async function () {
		const error = new TypeError('expected');
		const customUserManager = new UserManager({ ...settingsStub });
		customUserManager.signinRedirect = function throwError() {
			throw error;
		};

		const wrapper = createWrapper({
			userManager: customUserManager,
		});

		const result = await act(async function () {
			const rendered = renderHook(function useAuthHook() {
				return useAuth();
			}, { wrapper });
			return rendered.result;
		});

		await act(async function () {
			await waitFor(function () {
				expect(result.current.user).toBeUndefined();
			});
		});

		await act(async function () {
			await result.current.signinRedirect({
				state: 'foo',
				ui_locales: 'en',
			});
		});

		expect(UserManager.prototype.signinRedirect).not.toHaveBeenCalled();

		expect(result.current.error).toBeTruthy();
		const { toString, ...actual } = result.current.error as unknown as Record<string, unknown>;
		expect(actual).toEqual({
			name: error.name,
			message: error.message,
			innerError: error,
			stack: error.stack,
			source: 'signinRedirect',
			args: {
				state: 'foo',
				ui_locales: 'en',
			},
		});
		expect(toString?.()).toEqual('TypeError: expected');
	});

	it('should throw an error if user manager and custom settings are passed in', async function () {
		const customUserManager = new UserManager({ ...settingsStub });
		const wrapper = createWrapper({
			...settingsStub,
			userManager: customUserManager,
		} as any);

		expect(wrapper).toThrow(TypeError);
	});

	it('should set isLoading to false after initializing', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(function useAuthHook() {
			return useAuth();
		}, { wrapper });
		expect(result.current.isLoading).toBe(true);

		await waitFor(function () {
			expect(result.current.isLoading).toBe(false);
		});
	});

	it('should set isLoading to true during a navigation', async function () {
		let resolve!: (value: User) => void;
		const mockSigninPopup = vi.mocked(UserManager.prototype.signinPopup).mockReturnValue(
			new Promise(function (_resolve) {
				resolve = _resolve;
			}),
		);
		const wrapper = createWrapper({ ...settingsStub });
		const { result } = renderHook(function useAuthHook() {
			return useAuth();
		}, { wrapper });

		await waitFor(function () {
			expect(result.current.isLoading).toBe(false);
		});

		void act(function () {
			void result.current.signinPopup();
		});

		await waitFor(function () {
			expect(result.current.isLoading).toBe(true);
		});

		void act(function () {
			resolve({} as User);
		});

		await waitFor(function () {
			expect(result.current.isLoading).toBe(false);
		});

		mockSigninPopup.mockRestore();
	});

	it('should set activeNavigator based on the most recent navigation', async function () {
		let resolve!: (value: User) => void;
		const mockSigninPopup = vi.mocked(UserManager.prototype.signinPopup).mockReturnValue(
			new Promise(function (_resolve) {
				resolve = _resolve;
			}),
		);
		const wrapper = createWrapper({ ...settingsStub });

		const result = await act(async function () {
			const rendered = renderHook(function useAuthHook() {
				return useAuth();
			}, { wrapper });
			return rendered.result;
		});

		await act(async function () {
			await waitFor(function () {
				expect(result.current.activeNavigator).toBe(undefined);
			});
		});

		void act(function () {
			void result.current.signinPopup();
		});

		await waitFor(function () {
			expect(result.current.activeNavigator).toBe('signinPopup');
		});

		void act(function () {
			resolve({} as User);
		});

		await waitFor(function () {
			expect(result.current.activeNavigator).toBe(undefined);
		});

		mockSigninPopup.mockRestore();
	});

	it('should not update context value after rerender without state changes', async function () {
		const wrapper = createWrapper({ ...settingsStub });
		const { result, rerender } = await act(async function () {
			return renderHook(function useAuthHook() {
				return useAuth();
			}, { wrapper });
		});
		const memoized = result.current;

		rerender();

		expect(result.current).toBe(memoized);
	});
});
