import { createWrapper } from "./helpers";
import { renderHook, waitFor } from "@testing-library/react";
import { UserManager } from "oidc-client-ts";
import { useAutoSignin } from "../src/useAutoSignin";
import type { AuthProviderProps } from "../src";

const settingsStub: AuthProviderProps = {
    authority: "authority",
    client_id: "client",
    redirect_uri: "redirect",
};

describe("useAutoSignin", () => {

    it("should auto sign in using default signinRedirect", async () => {
        const wrapper = createWrapper({ ...settingsStub });
        const { result } = renderHook(() => useAutoSignin(), { wrapper });

        await waitFor(() => expect(result.current).toBeDefined());

        expect(UserManager.prototype.signinRedirect).toHaveBeenCalled();
        expect(UserManager.prototype.getUser).toHaveBeenCalled();
    });

    it("should auto sign in using provided method signinRedirect", async () => {
        const wrapper = createWrapper({ ...settingsStub });
        const { result } = renderHook(() => useAutoSignin({ signinMethod: "signinRedirect" }), { wrapper });

        await waitFor(() => expect(result.current).toBeDefined());

        expect(UserManager.prototype.signinRedirect).toHaveBeenCalled();
        expect(UserManager.prototype.getUser).toHaveBeenCalled();
    });

    it("should auto sign in using provided method signinPopup", async () => {
        const wrapper = createWrapper({ ...settingsStub });
        const { result } = renderHook(() => useAutoSignin({ signinMethod: "signinPopup" }), { wrapper });

        await waitFor(() => expect(result.current).toBeDefined());

        expect(UserManager.prototype.signinPopup).toHaveBeenCalled();
        expect(UserManager.prototype.getUser).toHaveBeenCalled();
    });

    it("should auto sign and not call signinRedirect if other method provided", async () => {
        const wrapper = createWrapper({ ...settingsStub });
        const { result } = renderHook(() => useAutoSignin({ signinMethod: "signinPopup" }), { wrapper });

        await waitFor(() => expect(result.current).toBeDefined());

        expect(UserManager.prototype.signinRedirect).not.toHaveBeenCalled();
        expect(UserManager.prototype.getUser).toHaveBeenCalled();
    });

    it("should pass signinArgs to signinRedirect when provided", async () => {
        const wrapper = createWrapper({ ...settingsStub });
        const redirectArgs = {
            redirect_uri: "custom_redirect",
            state: "custom_state",
        };
        const { result } = renderHook(() => useAutoSignin({
            signinMethod: "signinRedirect",
            signinArgs: redirectArgs,
        }), { wrapper });

        await waitFor(() => expect(result.current).toBeDefined());

        expect(UserManager.prototype.signinRedirect).toHaveBeenCalledWith(redirectArgs);
    });

    it("should pass signinArgs to signinPopup when provided", async () => {
        const wrapper = createWrapper({ ...settingsStub });
        const popupArgs = {
            redirect_uri: "custom_popup_redirect",
            popupWindowFeatures: {
                width: 500,
                height: 600,
            },
            extraQueryParams: { foo: "bar" },
        };
        const { result } = renderHook(() => useAutoSignin({
            signinMethod: "signinPopup",
            signinArgs: popupArgs,
        }), { wrapper });

        await waitFor(() => expect(result.current).toBeDefined());

        expect(UserManager.prototype.signinPopup).toHaveBeenCalledWith(popupArgs);
    });

    it("should pass signinArgs to signinRedirect when using default method", async () => {
        const wrapper = createWrapper({ ...settingsStub });
        const redirectArgs = {
            redirect_uri: "default_method_redirect",
            extraQueryParams: { foo: "bar" },
        };
        const { result } = renderHook(() => useAutoSignin({
            signinArgs: redirectArgs,
        }), { wrapper });

        await waitFor(() => expect(result.current).toBeDefined());

        expect(UserManager.prototype.signinRedirect).toHaveBeenCalledWith(redirectArgs);
    });

    it("should call signinRedirect without signinArgs when no signinArgs provided", async () => {
        const wrapper = createWrapper({ ...settingsStub });
        const { result } = renderHook(() => useAutoSignin({
            signinMethod: "signinRedirect",
        }), { wrapper });

        await waitFor(() => expect(result.current).toBeDefined());

        expect(UserManager.prototype.signinRedirect).toHaveBeenCalledWith(undefined);
    });

    it("should call signinPopup without signinArgs when no signinArgs provided", async () => {
        const wrapper = createWrapper({ ...settingsStub });
        const { result } = renderHook(() => useAutoSignin({
            signinMethod: "signinPopup",
        }), { wrapper });

        await waitFor(() => expect(result.current).toBeDefined());

        expect(UserManager.prototype.signinPopup).toHaveBeenCalledWith(undefined);
    });

});
