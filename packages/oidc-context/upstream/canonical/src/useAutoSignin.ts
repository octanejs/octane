import React from "react";
import { useAuth } from "./useAuth";
import { hasAuthParams } from "./utils";
import type { AuthState } from "./AuthState";
import type {
    SigninPopupArgs, SigninRedirectArgs,
} from "oidc-client-ts";

type UseAutoSignInReturn = Pick<AuthState, "isAuthenticated" | "isLoading" | "error">

/**
 * @public
 *
 * Automatically attempts to sign in a user using the default redirect method.
 *
 * This hook manages automatic sign-in behavior for a user. It uses the redirect sign-in
 * method by default, the current authentication state, and ensures the sign-in attempt is made only once
 * in the application context.
 *
 * Does not support the `signinResourceOwnerCredentials` method!
 *
 * @param options - (Optional) Configuration object. Defaults to `{ signinMethod: "signinRedirect" }`. May include optional `args` for redirect-specific settings (redirect_uri, state, extraQueryParams, etc.).
 *
 * @returns The current status of the authentication process.
 */
export function useAutoSignin(options?: {
    signinArgs?: SigninRedirectArgs;
}): UseAutoSignInReturn;

/**
 * @public
 *
 * Automatically attempts to sign in a user using redirect method.
 *
 * This hook manages automatic sign-in behavior for a user. It uses the redirect sign-in
 * method, the current authentication state, and ensures the sign-in attempt is made only once
 * in the application context.
 *
 * Does not support the `signinResourceOwnerCredentials` method!
 *
 * @param options - Configuration object with `signinMethod: "signinRedirect"` and optional `args` for redirect-specific settings (redirect_uri, state, extraQueryParams, etc.).
 *
 * @returns The current status of the authentication process.
 */
export function useAutoSignin(options: {
    signinMethod: "signinRedirect";
    signinArgs?: SigninRedirectArgs;
}): UseAutoSignInReturn;

/**
 * @public
 *
 * Automatically attempts to sign in a user using popup method.
 *
 * This hook manages automatic sign-in behavior for a user. It uses the popup sign-in
 * method, the current authentication state, and ensures the sign-in attempt is made only once
 * in the application context.
 *
 * Does not support the `signinResourceOwnerCredentials` method!
 *
 * @param options - Configuration object with `signinMethod: "signinPopup"` and optional `args` for popup-specific settings (popup window features, redirect_uri, etc.).
 *
 * @returns The current status of the authentication process.
 */
export function useAutoSignin(options: {
    signinMethod: "signinPopup";
    signinArgs?: SigninPopupArgs;
}): UseAutoSignInReturn;

export function useAutoSignin({ signinMethod = "signinRedirect", signinArgs }: {
    signinMethod?: "signinRedirect" | "signinPopup";
    signinArgs?: SigninPopupArgs | SigninRedirectArgs;
} = {}): UseAutoSignInReturn {
    const auth = useAuth();
    const [hasTriedSignin, setHasTriedSignin] = React.useState(false);

    const shouldAttemptSignin = React.useMemo(() => !hasAuthParams() && !auth.isAuthenticated && !auth.activeNavigator && !auth.isLoading &&
        !hasTriedSignin, [auth.activeNavigator, auth.isAuthenticated, auth.isLoading, hasTriedSignin]);

    React.useEffect(() => {
        if (shouldAttemptSignin) {
            switch (signinMethod) {
                case "signinPopup":
                    void auth.signinPopup(signinArgs);
                    break;
                case "signinRedirect":
                default:
                    void auth.signinRedirect(signinArgs);
                    break;
            }

            setHasTriedSignin(true);
        }
    }, [auth, hasTriedSignin, shouldAttemptSignin, signinMethod, signinArgs]);

    return {
        isLoading: auth.isLoading,
        isAuthenticated: auth.isAuthenticated,
        error: auth.error,
    };
};
