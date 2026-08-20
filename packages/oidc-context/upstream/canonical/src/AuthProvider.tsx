import type { ProcessResourceOwnerPasswordCredentialsArgs, SignoutResponse } from "oidc-client-ts";
import { User, UserManager, type UserManagerSettings } from "oidc-client-ts";
import React from "react";

import { AuthContext } from "./AuthContext";
import { type ErrorContext, initialAuthState } from "./AuthState";
import { reducer } from "./reducer";
import { hasAuthParams, normalizeError, renewSilentError, signinError, signoutError } from "./utils";

/**
 * @public
 */
export interface AuthProviderBaseProps {
    /**
     * The child nodes your Provider has wrapped
     */
    children?: React.ReactNode;

    /**
     * On sign in callback hook. Can be a async function.
     * Here you can remove the code and state parameters from the url when you are redirected from the authorize page.
     *
     * ```jsx
     * const onSigninCallback = (_user: User | undefined): void => {
     *     window.history.replaceState(
     *         {},
     *         document.title,
     *         window.location.pathname
     *     )
     * }
     * ```
     */
    onSigninCallback?: (user: User | undefined) => Promise<void> | void;

    /**
     * By default, if the page url has code/state params, this provider will call automatically the `userManager.signinCallback`.
     * In some cases the code might be for something else (another OAuth SDK perhaps). In these
     * instances you can instruct the client to ignore them.
     *
     * ```jsx
     * <AuthProvider
     *   skipSigninCallback={window.location.pathname === "/stripe-oauth-callback"}
     * >
     * ```
     */
    skipSigninCallback?: boolean;

    /**
     * Match the redirect uri used for logout (e.g. `post_logout_redirect_uri`)
     * This provider will then call automatically the `userManager.signoutCallback`.
     *
     * HINT:
     * Do not call `userManager.signoutRedirect()` within a `React.useEffect`, otherwise the
     * logout might be unsuccessful.
     *
     * ```jsx
     * <AuthProvider
     *   matchSignoutCallback={(args) => {
     *     window &&
     *     (window.location.href === args.post_logout_redirect_uri);
     *   }}
     * ```
     */
    matchSignoutCallback?: (args: UserManagerSettings) => boolean;

    /**
     * On sign out callback hook. Can be a async function.
     * Here you can change the url after the user is signed out.
     * When using this, specifying `matchSignoutCallback` is required.
     *
     * ```jsx
     * const onSignoutCallback = (resp: SignoutResponse | undefined): void => {
     *     // go to home after logout
     *     window.location.pathname = ""
     * }
     * ```
     */
    onSignoutCallback?: (resp: SignoutResponse | undefined) => Promise<void> | void;

    /**
     * On remove user hook. Can be a async function.
     * Here you can change the url after the user is removed.
     *
     * ```jsx
     * const onRemoveUser = (): void => {
     *     // go to home after logout
     *     window.location.pathname = ""
     * }
     * ```
     */
    onRemoveUser?: () => Promise<void> | void;
}

/**
 * This interface (default) is used to pass `UserManagerSettings` together with `AuthProvider` properties to the provider.
 *
 * @public
 */
export interface AuthProviderNoUserManagerProps extends AuthProviderBaseProps, UserManagerSettings {
    /**
     * Prevent this property.
     */
    userManager?: never;
}

/**
 * This interface is used to pass directly a `UserManager` instance together with `AuthProvider` properties to the provider.
 *
 * @public
 */
export interface AuthProviderUserManagerProps extends AuthProviderBaseProps {
    /**
     * Allow passing a custom UserManager instance.
     */
    userManager?: UserManager;
}

/**
 * @public
 */
export type AuthProviderProps = AuthProviderNoUserManagerProps | AuthProviderUserManagerProps;

const userManagerContextKeys = [
    "clearStaleState",
    "querySessionStatus",
    "revokeTokens",
    "startSilentRenew",
    "stopSilentRenew",
] as const;
const navigatorKeys = [
    "signinPopup",
    "signinSilent",
    "signinRedirect",
    "signinResourceOwnerCredentials",
    "signoutPopup",
    "signoutRedirect",
    "signoutSilent",
] as const;
const unsupportedEnvironment = (fnName: string) => () => {
    throw new Error(
        `UserManager#${fnName} was called from an unsupported context. If this is a server-rendered page, defer this call with useEffect() or pass a custom UserManager implementation.`,
    );
};
const UserManagerImpl =
    typeof window === "undefined" ? null : UserManager;

/**
 * Provides the AuthContext to its child components.
 *
 * @public
 */
export const AuthProvider = (props: AuthProviderProps): React.JSX.Element => {
    const {
        children,

        onSigninCallback,
        skipSigninCallback,

        matchSignoutCallback,
        onSignoutCallback,

        onRemoveUser,

        userManager: userManagerProp = null,
        ...userManagerSettings
    } = props;

    const [userManager] = React.useState(() => {
        return userManagerProp ??
            (UserManagerImpl
                ? new UserManagerImpl(userManagerSettings as UserManagerSettings)
                : ({ settings: userManagerSettings } as UserManager));
    });

    const [state, dispatch] = React.useReducer(reducer, initialAuthState);
    const userManagerContext = React.useMemo(
        () =>
            Object.assign(
                {
                    settings: userManager.settings,
                    events: userManager.events,
                },
                Object.fromEntries(
                    userManagerContextKeys.map((key) => [
                        key,
                        userManager[key]?.bind(userManager) ??
                        unsupportedEnvironment(key),
                    ]),
                ) as Pick<UserManager, typeof userManagerContextKeys[number]>,
                Object.fromEntries(
                    navigatorKeys.map((key) => [
                        key,
                        userManager[key]
                            ? async (args: ProcessResourceOwnerPasswordCredentialsArgs & never[]) => {
                                dispatch({
                                    type: "NAVIGATOR_INIT",
                                    method: key,
                                });
                                try {
                                    return await userManager[key](args);
                                } catch (error) {
                                    dispatch({
                                        type: "ERROR",
                                        error: {
                                            ...normalizeError(error, `Unknown error while executing ${key}(...).`),
                                            source: key,
                                            args: args,
                                        } as ErrorContext,
                                    });
                                    return null;
                                } finally {
                                    dispatch({ type: "NAVIGATOR_CLOSE" });
                                }
                            }
                            : unsupportedEnvironment(key),
                    ]),
                ) as Pick<UserManager, typeof navigatorKeys[number]>,
            ),
        [userManager],
    );
    const didInitialize = React.useRef(false);

    React.useEffect(() => {
        if (!userManager || didInitialize.current) {
            return;
        }
        didInitialize.current = true;

        void (async (): Promise<void> => {
            // sign-in
            try {
                let user: User | undefined | null = null;

                // check if returning back from authority server
                if (hasAuthParams() && !skipSigninCallback) {
                    user = await userManager.signinCallback();
                    if (onSigninCallback) await onSigninCallback(user);
                }
                user = !user ? await userManager.getUser() : user;
                dispatch({ type: "INITIALISED", user });
            } catch (error) {
                dispatch({
                    type: "ERROR",
                    error: signinError(error),
                });
            }

            // sign-out
            try {
                if (matchSignoutCallback && matchSignoutCallback(userManager.settings)) {
                    const resp = await userManager.signoutCallback();
                    if (onSignoutCallback) await onSignoutCallback(resp);
                }
            } catch (error) {
                dispatch({
                    type: "ERROR",
                    error: signoutError(error),
                });
            }
        })();
    }, [userManager, skipSigninCallback, onSigninCallback, onSignoutCallback, matchSignoutCallback]);

    // register to userManager events
    React.useEffect(() => {
        if (!userManager) return undefined;
        // event UserLoaded (e.g. initial load, silent renew success)
        const handleUserLoaded = (user: User) => {
            dispatch({ type: "USER_LOADED", user });
        };
        userManager.events.addUserLoaded(handleUserLoaded);

        // event UserUnloaded (e.g. userManager.removeUser)
        const handleUserUnloaded = () => {
            dispatch({ type: "USER_UNLOADED" });
        };
        userManager.events.addUserUnloaded(handleUserUnloaded);

        // event UserSignedOut (e.g. user was signed out in background (checkSessionIFrame option))
        const handleUserSignedOut = () => {
            dispatch({ type: "USER_SIGNED_OUT" });
        };
        userManager.events.addUserSignedOut(handleUserSignedOut);

        // event SilentRenewError (silent renew error)
        const handleSilentRenewError = (error: Error) => {
            dispatch({
                type: "ERROR",
                error: renewSilentError(error),
            });
        };
        userManager.events.addSilentRenewError(handleSilentRenewError);

        return () => {
            userManager.events.removeUserLoaded(handleUserLoaded);
            userManager.events.removeUserUnloaded(handleUserUnloaded);
            userManager.events.removeUserSignedOut(handleUserSignedOut);
            userManager.events.removeSilentRenewError(handleSilentRenewError);
        };
    }, [userManager]);

    const removeUser = React.useCallback(async () => {
        if (!userManager) unsupportedEnvironment("removeUser");
        await userManager.removeUser();
        if (onRemoveUser) await onRemoveUser();
    }, [userManager, onRemoveUser]);

    const contextValue = React.useMemo(() => {
        return {
            ...state,
            ...userManagerContext,
            removeUser,
        };
    }, [state, userManagerContext, removeUser]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};
