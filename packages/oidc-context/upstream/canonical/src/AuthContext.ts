import React from "react";
import type {
    UserManagerSettings, UserManagerEvents, User, SessionStatus,
    SigninPopupArgs, SigninSilentArgs, SigninRedirectArgs,
    SignoutRedirectArgs, SignoutPopupArgs, QuerySessionStatusArgs,
    RevokeTokensTypes, SignoutSilentArgs, SigninResourceOwnerCredentialsArgs,
} from "oidc-client-ts";

import type { AuthState } from "./AuthState";

/**
 * @public
 */
export interface AuthContextProps extends AuthState {
    /**
     * UserManager functions. See [UserManager](https://github.com/authts/oidc-client-ts) for more details.
     */
    readonly settings: UserManagerSettings;
    readonly events: UserManagerEvents;
    clearStaleState(): Promise<void>;
    removeUser(): Promise<void>;
    signinPopup(args?: SigninPopupArgs): Promise<User>;
    signinSilent(args?: SigninSilentArgs): Promise<User | null>;
    signinRedirect(args?: SigninRedirectArgs): Promise<void>;
    signinResourceOwnerCredentials(args: SigninResourceOwnerCredentialsArgs): Promise<User>;
    signoutRedirect(args?: SignoutRedirectArgs): Promise<void>;
    signoutPopup(args?: SignoutPopupArgs): Promise<void>;
    signoutSilent(args?: SignoutSilentArgs): Promise<void>;
    querySessionStatus(args?: QuerySessionStatusArgs): Promise<SessionStatus | null>;
    revokeTokens(types?: RevokeTokensTypes): Promise<void>;
    startSilentRenew(): void;
    stopSilentRenew(): void;
}

/**
 * @public
 */
export const AuthContext = React.createContext<AuthContextProps | undefined>(undefined);
AuthContext.displayName = "AuthContext";
