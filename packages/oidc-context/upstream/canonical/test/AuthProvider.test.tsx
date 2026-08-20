import { renderHook, waitFor, act } from "@testing-library/react";
import { mocked } from "jest-mock";
import { UserManager, User } from "oidc-client-ts";
import { useAuth } from "../src/useAuth";
import { createWrapper } from "./helpers";

const settingsStub = {
    authority: "authority",
    client_id: "client",
    redirect_uri: "redirect",
};
const user = { id_token: "__test_user__" } as User;

describe("AuthProvider", () => {
    it("should signinRedirect when asked", async () => {
        // arrange
        const wrapper = createWrapper({ ...settingsStub });

        const { result } = renderHook(() => useAuth(), {
            wrapper,
        });

        await waitFor(() => expect(result.current.user).toBeUndefined());

        //act
        await act(() => result.current.signinRedirect());

        // assert
        expect(UserManager.prototype.signinRedirect).toHaveBeenCalled();
        expect(UserManager.prototype.getUser).toHaveBeenCalled();
    });

    it("should handle signinCallback success and call onSigninCallback", async () => {
        // arrange
        const onSigninCallback = jest.fn();
        window.history.pushState(
            {},
            document.title,
            "/?code=__test_code__&state=__test_state__",
        );
        expect(window.location.href).toBe(
            "https://www.example.com/?code=__test_code__&state=__test_state__",
        );

        const wrapper = createWrapper({ ...settingsStub, onSigninCallback });

        // act
        act(() => {
            renderHook(() => useAuth(), {
                wrapper,
            });
        });

        // assert
        await waitFor(() => expect(onSigninCallback).toHaveBeenCalledTimes(1));
        expect(UserManager.prototype.signinCallback).toHaveBeenCalledTimes(1);
    });

    it("should run onSigninCallback only once in StrictMode", async () => {
        // arrange
        const onSigninCallback = jest.fn();
        window.history.pushState(
            {},
            document.title,
            "/?code=__test_code__&state=__test_state__",
        );
        expect(window.location.href).toBe(
            "https://www.example.com/?code=__test_code__&state=__test_state__",
        );

        const wrapper = createWrapper({ ...settingsStub, onSigninCallback });

        // act
        act(() => {
            renderHook(() => useAuth(), {
                wrapper,
            });
        });

        // assert
        await waitFor(() => expect(onSigninCallback).toHaveBeenCalledTimes(1));
        expect(UserManager.prototype.signinCallback).toHaveBeenCalledTimes(1);
    });

    it("should handle signinCallback errors and call onSigninCallback", async () => {
        // arrange
        const onSigninCallback = jest.fn();
        window.history.pushState(
            {},
            document.title,
            "/?error=__test_error__&state=__test_state__",
        );
        expect(window.location.href).toBe(
            "https://www.example.com/?error=__test_error__&state=__test_state__",
        );

        const wrapper = createWrapper({ ...settingsStub, onSigninCallback });

        // act
        act(() => {
            renderHook(() => useAuth(), {
                wrapper,
            });
        });

        // assert
        await waitFor(() => expect(onSigninCallback).toHaveBeenCalledTimes(1));
        expect(UserManager.prototype.signinCallback).toHaveBeenCalledTimes(1);
    });

    it("should handle signoutCallback success and call onSignoutCallback", async () => {
        // arrange
        const onSignoutCallback = jest.fn();
        window.history.pushState(
            {},
            document.title,
            "/signout-callback",
        );
        expect(window.location.pathname).toBe(
            "/signout-callback",
        );

        const wrapper = createWrapper({
            ...settingsStub,
            post_logout_redirect_uri: "https://www.example.com/signout-callback",
            matchSignoutCallback: () => window.location.pathname === "/signout-callback",
            onSignoutCallback,
        });

        // act
        act(() => {
            renderHook(() => useAuth(), {
                wrapper,
            });
        });

        // assert
        await waitFor(() => expect(onSignoutCallback).toHaveBeenCalledTimes(1));
        expect(UserManager.prototype.signoutCallback).toHaveBeenCalledTimes(1);
    });

    it("should handle error when signoutCallback throws Error", async () => {
        // arrange
        const error = new TypeError("expected");
        const onSignoutCallback = () => { throw error; };
        window.history.pushState(
            {},
            document.title,
            "/signout-callback",
        );
        expect(window.location.pathname).toBe(
            "/signout-callback",
        );

        const wrapper = createWrapper({
            ...settingsStub,
            post_logout_redirect_uri: "https://www.example.com/signout-callback",
            matchSignoutCallback: () => window.location.pathname === "/signout-callback",
            onSignoutCallback,
        });

        // act
        const result = await act(async () => {
            const { result } = renderHook(() => useAuth(), {
                wrapper,
            });
            return result;
        });

        await act(async () => {
            await waitFor(() => {
                expect(result.current.user).toBeUndefined();
            });
        });

        // assert
        expect(result.current.error).toBeTruthy();
        const { toString, ...actual } = result.current.error as unknown as Record<string, unknown>;
        expect(actual).toEqual({
            name: error.name,
            message: error.message,
            innerError: error,
            stack: error.stack,
            source: "signoutCallback",
        });
        expect(toString?.()).toEqual("TypeError: expected");
    });

    it("should signinResourceOwnerCredentials when asked", async () => {
        // arrange
        const wrapper = createWrapper({ ...settingsStub });

        const { result } = renderHook(() => useAuth(), {
            wrapper,
        });

        await waitFor(() => expect(result.current.user).toBeUndefined());

        //act
        await act(() => result.current.signinResourceOwnerCredentials({
            username: "username",
            password: "password",
            skipUserInfo: false,
        }));

        // assert
        expect(UserManager.prototype.signinResourceOwnerCredentials).toHaveBeenCalled();
        expect(UserManager.prototype.getUser).toHaveBeenCalled();
    });

    it("should handle removeUser and call onRemoveUser", async () => {
        // arrange
        const onRemoveUser = jest.fn();

        const wrapper = createWrapper({ ...settingsStub, onRemoveUser });
        const { result } = renderHook(() => useAuth(), {
            wrapper,
        });

        // act
        await act(() => result.current.removeUser());

        // assert
        await waitFor(() => expect(onRemoveUser).toHaveBeenCalled());
        expect(UserManager.prototype.removeUser).toHaveBeenCalled();
    });

    it("should handle signoutSilent", async () => {
        // arrange
        const wrapper = createWrapper({ ...settingsStub });
        const { result } = renderHook(() => useAuth(), {
            wrapper,
        });

        // act
        await act(() => result.current.signoutSilent());

        // assert
        expect(UserManager.prototype.signoutSilent).toHaveBeenCalled();
    });

    it("should get the user", async () => {
        const mockGetUser = mocked(
            UserManager.prototype,
        ).getUser.mockImplementation(() => {
            return new Promise((resolve) => {
                resolve(user);
            });
        });

        // arrange
        const wrapper = createWrapper({ ...settingsStub });

        // act
        const { result } = renderHook(() => useAuth(), {
            wrapper,
        });

        // assert
        await waitFor(() =>
            expect(UserManager.prototype.getUser).toHaveBeenCalled(),
        );

        await waitFor(() => expect(result.current.user).toBe(user));

        mockGetUser.mockRestore();
    });

    it("should allow passing a custom UserManager", async () => {
        // arrange
        const customUserManager = new UserManager({ ...settingsStub });
        customUserManager.signinRedirect = jest
            .fn()
            .mockResolvedValue(undefined);

        const wrapper = createWrapper({
            userManager: customUserManager,
        });

        const result = await act(async () => {
            const { result } = renderHook(() => useAuth(), {
                wrapper,
            });
            return result;
        });

        await act(async () => {
            await waitFor(() => {
                expect(result.current.user).toBeUndefined();
            });
        });

        // act
        await act(async () => {
            await result.current.signinRedirect();
        });

        // assert
        expect(UserManager.prototype.signinRedirect).not.toHaveBeenCalled();
        expect(customUserManager.signinRedirect).toHaveBeenCalled();
    });

    it("should handle errors of signinRedirect", async () => {
        // arrange
        const error = new TypeError("expected");
        const customUserManager = new UserManager({ ...settingsStub });
        customUserManager.signinRedirect = () => { throw error; };

        const wrapper = createWrapper({
            userManager: customUserManager,
        });

        const result = await act(async () => {
            const { result } = renderHook(() => useAuth(), {
                wrapper,
            });
            return result;
        });

        await act(async () => {
            await waitFor(() => {
                expect(result.current.user).toBeUndefined();
            });
        });

        // act
        await act(async () => {
            await result.current.signinRedirect({
                state: "foo",
                ui_locales: "en",
            });
        });

        // assert
        expect(UserManager.prototype.signinRedirect).not.toHaveBeenCalled();

        expect(result.current.error).toBeTruthy();
        const { toString, ...actual } = result.current.error as unknown as Record<string, unknown>;
        expect(actual).toEqual({
            name: error.name,
            message: error.message,
            innerError: error,
            stack: error.stack,
            source: "signinRedirect",
            args: {
                state: "foo",
                ui_locales: "en",
            },
        });
        expect(toString?.()).toEqual("TypeError: expected");
    });

    it("should throw an error if user manager and custom settings are passed in", async () => {
        // arrange
        const customUserManager = new UserManager({ ...settingsStub });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const wrapper = createWrapper({
            ...settingsStub,
            userManager: customUserManager,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        expect(wrapper).toThrow(TypeError);
    });

    it("should set isLoading to false after initializing", async () => {
        // arrange
        const wrapper = createWrapper({ ...settingsStub });
        const { result } = renderHook(() => useAuth(), {
            wrapper,
        });
        expect(result.current.isLoading).toBe(true);

        // act & assert
        await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    it("should set isLoading to true during a navigation", async () => {
        // arrange
        let resolve: (value: User) => void;
        const mockSigninPopup = mocked(
            UserManager.prototype,
        ).signinPopup.mockReturnValue(
            new Promise((_resolve) => {
                resolve = _resolve;
            }),
        );
        const wrapper = createWrapper({ ...settingsStub });
        const { result } = renderHook(() => useAuth(), {
            wrapper,
        });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // act
        void act(() => void result.current.signinPopup());

        // assert
        await waitFor(() => expect(result.current.isLoading).toBe(true));

        // act
        void act(() => resolve({} as User));

        // assert
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        mockSigninPopup.mockRestore();
    });

    it("should set activeNavigator based on the most recent navigation", async () => {
        // arrange
        let resolve: (value: User) => void;
        const mockSigninPopup = mocked(
            UserManager.prototype,
        ).signinPopup.mockReturnValue(
            new Promise((_resolve) => {
                resolve = _resolve;
            }),
        );
        const wrapper = createWrapper({ ...settingsStub });

        const result = await act(async () => {
            const { result } = renderHook(() => useAuth(), {
                wrapper,
            });
            return result;
        });

        await act(async () => {
            await waitFor(() =>
                expect(result.current.activeNavigator).toBe(undefined),
            );
        });

        // act
        void act(() => void result.current.signinPopup());

        // assert
        await waitFor(() =>
            expect(result.current.activeNavigator).toBe("signinPopup"),
        );

        // act
        void act(() => resolve({} as User));

        // assert
        await waitFor(() =>
            expect(result.current.activeNavigator).toBe(undefined),
        );

        mockSigninPopup.mockRestore();
    });

    it("should not update context value after rerender without state changes", async () => {
        // arrange
        const wrapper = createWrapper({ ...settingsStub });
        const { result, rerender } = await act(async () => {
            const { result, rerender } = renderHook(() => useAuth(), {
                wrapper,
            });
            return { result, rerender };
        });
        const memoized = result.current;

        // act
        rerender();

        // assert
        expect(result.current).toBe(memoized);
    });
});
