import type {
    SigninPopupArgs,
    SigninRedirectArgs,
    SigninResourceOwnerCredentialsArgs,
    SigninSilentArgs,
    SignoutPopupArgs,
    SignoutRedirectArgs,
    SignoutSilentArgs,
    User,
} from "oidc-client-ts";

/**
 * The auth state which, when combined with the auth methods, make up the return object of the `useAuth` hook.
 *
 * @public
 */
export interface AuthState {
    /**
     * See [User](https://authts.github.io/oidc-client-ts/classes/User.html) for more details.
     */
    user?: User | null;

    /**
     * True when the library has been initialized and no navigator request is in progress.
     */
    isLoading: boolean;

    /**
     * True while the user has a valid access token.
     */
    isAuthenticated: boolean;

    /**
     * Tracks the status of most recent signin/signout request method.
     */
    activeNavigator?: "signinRedirect" | "signinResourceOwnerCredentials" | "signinPopup" | "signinSilent" | "signoutRedirect" | "signoutPopup" | "signoutSilent";

    /**
     * Was there a signin or silent renew error?
     */
    error?: ErrorContext;
}

/**
 * Represents an error while execution of a signing, renew, ...
 *
 * @public
 */
export type ErrorContext = Error & {
    innerError?: unknown;
} & ({ source: "signinCallback" }
    | { source: "signoutCallback" }
    | { source: "renewSilent" }

    | { source: "signinPopup"; args: SigninPopupArgs | undefined }
    | { source: "signinSilent"; args: SigninSilentArgs | undefined }
    | { source: "signinRedirect"; args: SigninRedirectArgs | undefined }
    | { source: "signinResourceOwnerCredentials"; args: SigninResourceOwnerCredentialsArgs | undefined }
    | { source: "signoutPopup"; args: SignoutPopupArgs | undefined }
    | { source: "signoutRedirect"; args: SignoutRedirectArgs | undefined }
    | { source: "signoutSilent"; args: SignoutSilentArgs | undefined }

    | { source: "unknown" }
);

/**
 * The initial auth state.
 */
export const initialAuthState: AuthState = {
    isLoading: true,
    isAuthenticated: false,
};
