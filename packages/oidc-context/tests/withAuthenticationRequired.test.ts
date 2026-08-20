// Per packages/oidc-context/upstream/canonical/test/withAuthenticationRequired.test.tsx
import { createElement, type OctaneNode } from 'octane';
import { act, render, screen, waitFor } from '@octanejs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { AuthProvider, withAuthenticationRequired, type AuthContextProps } from '../src';
import * as useAuthModule from '../src/useAuth';

vi.mock('oidc-client-ts', function () {
	return import('./_mocks/oidc-client-ts');
});

const settingsStub = { authority: 'authority', client_id: 'client', redirect_uri: 'redirect' };

describe('withAuthenticationRequired', function () {
	it('should block access to a private component when not authenticated', async function () {
		const useAuthMock = vi.spyOn(useAuthModule, 'useAuth');
		const authContext = { isLoading: false, isAuthenticated: false } as AuthContextProps;
		const signinRedirectMock = vi.fn().mockResolvedValue(undefined);
		authContext.signinRedirect = signinRedirectMock;
		useAuthMock.mockReturnValue(authContext);

		function MyComponent(): OctaneNode {
			return createElement('span', null, 'Private');
		}
		const WrappedComponent = withAuthenticationRequired(MyComponent);

		render(createElement(AuthProvider, settingsStub, createElement(WrappedComponent)));

		await waitFor(function () {
			expect(signinRedirectMock).toHaveBeenCalled();
		});
		expect(screen.queryByText('Private')).toBeNull();
	});

	it('should allow access to a private component when authenticated', async function () {
		const useAuthMock = vi.spyOn(useAuthModule, 'useAuth');
		const authContext = { isLoading: false, isAuthenticated: true } as AuthContextProps;
		const signinRedirectMock = vi.fn().mockResolvedValue(undefined);
		authContext.signinRedirect = signinRedirectMock;
		useAuthMock.mockReturnValue(authContext);

		function MyComponent(): OctaneNode {
			return createElement('span', null, 'Private');
		}
		const WrappedComponent = withAuthenticationRequired(MyComponent);

		act(function () {
			render(createElement(AuthProvider, settingsStub, createElement(WrappedComponent)));
		});

		await waitFor(function () {
			expect(signinRedirectMock).not.toHaveBeenCalled();
		});
		await screen.findByText('Private');
	});

	it('should show a custom redirecting message when not authenticated', async function () {
		const useAuthMock = vi.spyOn(useAuthModule, 'useAuth');
		const authContext = { isLoading: false, isAuthenticated: false } as AuthContextProps;
		const signinRedirectMock = vi.fn().mockResolvedValue(undefined);
		authContext.signinRedirect = signinRedirectMock;
		useAuthMock.mockReturnValue(authContext);

		function MyComponent(): OctaneNode {
			return createElement('span', null, 'Private');
		}
		function OnRedirecting(): OctaneNode {
			return createElement('span', null, 'Redirecting');
		}
		const WrappedComponent = withAuthenticationRequired(MyComponent, {
			OnRedirecting,
		});

		act(function () {
			render(createElement(AuthProvider, settingsStub, createElement(WrappedComponent)));
		});

		await screen.findByText('Redirecting');
	});

	it('should call onBeforeSignin before signinRedirect', async function () {
		const useAuthMock = vi.spyOn(useAuthModule, 'useAuth');
		const authContext = { isLoading: false, isAuthenticated: false } as AuthContextProps;
		const signinRedirectMock = vi.fn().mockResolvedValue(undefined);
		authContext.signinRedirect = signinRedirectMock;
		useAuthMock.mockReturnValue(authContext);

		function MyComponent(): OctaneNode {
			return createElement('span', null, 'Private');
		}
		const onBeforeSigninMock = vi.fn();
		const WrappedComponent = withAuthenticationRequired(MyComponent, {
			onBeforeSignin: onBeforeSigninMock,
		});

		render(createElement(AuthProvider, settingsStub, createElement(WrappedComponent)));

		await waitFor(function () {
			expect(onBeforeSigninMock).toHaveBeenCalled();
		});

		await waitFor(function () {
			expect(signinRedirectMock).toHaveBeenCalled();
		});
	});

	it('should pass additional options on to signinRedirect', async function () {
		const useAuthMock = vi.spyOn(useAuthModule, 'useAuth');
		const authContext = { isLoading: false, isAuthenticated: false } as AuthContextProps;
		const signinRedirectMock = vi.fn().mockResolvedValue(undefined);
		authContext.signinRedirect = signinRedirectMock;
		useAuthMock.mockReturnValue(authContext);

		function MyComponent(): OctaneNode {
			return createElement('span', null, 'Private');
		}
		const WrappedComponent = withAuthenticationRequired(MyComponent, {
			signinRedirectArgs: {
				redirect_uri: 'foo',
			},
		});

		render(createElement(AuthProvider, settingsStub, createElement(WrappedComponent)));

		await waitFor(function () {
			expect(signinRedirectMock).toHaveBeenCalledWith(
				expect.objectContaining({
					redirect_uri: 'foo',
				}),
			);
		});
	});

	it('should call signinRedirect only once even if parent state changes', async function () {
		const useAuthMock = vi.spyOn(useAuthModule, 'useAuth');
		const authContext = { isLoading: false, isAuthenticated: false } as AuthContextProps;
		const signinRedirectMock = vi.fn().mockResolvedValue(undefined);
		authContext.signinRedirect = signinRedirectMock;
		useAuthMock.mockReturnValue(authContext);

		function MyComponent(): OctaneNode {
			return createElement('span', null, 'Private');
		}
		const WrappedComponent = withAuthenticationRequired(MyComponent);
		function App(props: { foo: number }): OctaneNode {
			return createElement(
				'div',
				null,
				String(props.foo),
				createElement(AuthProvider, settingsStub, createElement(WrappedComponent)),
			);
		}

		const { rerender } = render(createElement(App, { foo: 1 }));
		await waitFor(function () {
			expect(signinRedirectMock).toHaveBeenCalled();
		});
		signinRedirectMock.mockClear();
		rerender(createElement(App, { foo: 2 }));

		await waitFor(function () {
			expect(signinRedirectMock).not.toHaveBeenCalled();
		});
	});
});
