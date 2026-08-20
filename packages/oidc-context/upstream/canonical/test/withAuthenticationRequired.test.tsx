import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";

import { AuthProvider, withAuthenticationRequired, type AuthContextProps } from "../src";
import * as useAuthModule from "../src/useAuth";

const settingsStub = { authority: "authority", client_id: "client", redirect_uri: "redirect" };

describe("withAuthenticationRequired", () => {
    it("should block access to a private component when not authenticated", async () => {
        // arrange
        const useAuthMock = jest.spyOn(useAuthModule, "useAuth");
        const authContext = { isLoading: false, isAuthenticated: false } as AuthContextProps;
        const signinRedirectMock = jest.fn().mockResolvedValue(undefined);
        authContext.signinRedirect = signinRedirectMock;
        useAuthMock.mockReturnValue(authContext);

        const MyComponent = (): React.JSX.Element => <>Private</>;
        const WrappedComponent = withAuthenticationRequired(MyComponent);

        // act
        render(
            <AuthProvider {...settingsStub}>
                <WrappedComponent />
            </AuthProvider>,
        );

        // assert
        await waitFor(() =>
            expect(signinRedirectMock).toHaveBeenCalled(),
        );
        expect(screen.queryByText("Private")).toBeNull();
    });

    it("should allow access to a private component when authenticated", async () => {
        // arrange
        const useAuthMock = jest.spyOn(useAuthModule, "useAuth");
        const authContext = { isLoading: false, isAuthenticated: true } as AuthContextProps;
        const signinRedirectMock = jest.fn().mockResolvedValue(undefined);
        authContext.signinRedirect = signinRedirectMock;
        useAuthMock.mockReturnValue(authContext);

        const MyComponent = (): React.JSX.Element => <>Private</>;
        const WrappedComponent = withAuthenticationRequired(MyComponent);

        // act
        act(() => {
            render(
                <AuthProvider {...settingsStub}>
                    <WrappedComponent />
                </AuthProvider>,
            );
        });

        // assert
        await waitFor(() =>
            expect(signinRedirectMock).not.toHaveBeenCalled(),
        );
        await screen.findByText("Private");
    });

    it("should show a custom redirecting message when not authenticated", async () => {
        // arrange
        const useAuthMock = jest.spyOn(useAuthModule, "useAuth");
        const authContext = { isLoading: false, isAuthenticated: false } as AuthContextProps;
        const signinRedirectMock = jest.fn().mockResolvedValue(undefined);
        authContext.signinRedirect = signinRedirectMock;
        useAuthMock.mockReturnValue(authContext);

        const MyComponent = (): React.JSX.Element => <>Private</>;
        const OnRedirecting = (): React.JSX.Element => <>Redirecting</>;
        const WrappedComponent = withAuthenticationRequired(MyComponent, {
            OnRedirecting,
        });

        // act
        act(() => {
            render(
                <AuthProvider {...settingsStub}>
                    <WrappedComponent />
                </AuthProvider>,
            );
        });

        // assert
        await screen.findByText("Redirecting");
    });

    it("should call onBeforeSignin before signinRedirect", async () => {
        // arrange
        const useAuthMock = jest.spyOn(useAuthModule, "useAuth");
        const authContext = { isLoading: false, isAuthenticated: false } as AuthContextProps;
        const signinRedirectMock = jest.fn().mockResolvedValue(undefined);
        authContext.signinRedirect = signinRedirectMock;
        useAuthMock.mockReturnValue(authContext);

        const MyComponent = (): React.JSX.Element => <>Private</>;
        const onBeforeSigninMock = jest.fn();
        const WrappedComponent = withAuthenticationRequired(MyComponent, {
            onBeforeSignin: onBeforeSigninMock,
        });

        // act
        render(
            <AuthProvider {...settingsStub}>
                <WrappedComponent />
            </AuthProvider>,
        );

        await waitFor(() =>
            expect(onBeforeSigninMock).toHaveBeenCalled(),
        );

        await waitFor(() =>
            expect(signinRedirectMock).toHaveBeenCalled(),
        );
    });

    it("should pass additional options on to signinRedirect", async () => {
        // arrange
        const useAuthMock = jest.spyOn(useAuthModule, "useAuth");
        const authContext = { isLoading: false, isAuthenticated: false } as AuthContextProps;
        const signinRedirectMock = jest.fn().mockResolvedValue(undefined);
        authContext.signinRedirect = signinRedirectMock;
        useAuthMock.mockReturnValue(authContext);

        const MyComponent = (): React.JSX.Element => <>Private</>;
        const WrappedComponent = withAuthenticationRequired(MyComponent, {
            signinRedirectArgs: {
                redirect_uri: "foo",
            },
        });

        // act
        render(
            <AuthProvider {...settingsStub}>
                <WrappedComponent />
            </AuthProvider>,
        );

        // assert
        await waitFor(() =>
            expect(signinRedirectMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    redirect_uri: "foo",
                }),
            ),
        );
    });

    it("should call signinRedirect only once even if parent state changes", async () => {
        // arrange
        const useAuthMock = jest.spyOn(useAuthModule, "useAuth");
        const authContext = { isLoading: false, isAuthenticated: false } as AuthContextProps;
        const signinRedirectMock = jest.fn().mockResolvedValue(undefined);
        authContext.signinRedirect = signinRedirectMock;
        useAuthMock.mockReturnValue(authContext);

        const MyComponent = (): React.JSX.Element => <>Private</>;
        const WrappedComponent = withAuthenticationRequired(MyComponent);
        const App = ({ foo }: { foo: number }): React.JSX.Element => (
            <div>
                {foo}
                <AuthProvider {...settingsStub}>
                    <WrappedComponent />
                </AuthProvider>
            </div>
        );

        // act
        const { rerender } = render(<App foo={1} />);
        await waitFor(() =>
            expect(signinRedirectMock).toHaveBeenCalled(),
        );
        signinRedirectMock.mockClear();
        rerender(<App foo={2} />);

        // assert
        await waitFor(() =>
            expect(signinRedirectMock).not.toHaveBeenCalled(),
        );
    });
});
