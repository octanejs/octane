import type { User } from "oidc-client-ts";

import type { AuthState, ErrorContext } from "./AuthState";

type Action =
    | { type: "INITIALISED" | "USER_LOADED"; user: User | null }
    | { type: "USER_UNLOADED" }
    | { type: "USER_SIGNED_OUT" }
    | { type: "NAVIGATOR_INIT"; method: NonNullable<AuthState["activeNavigator"]> }
    | { type: "NAVIGATOR_CLOSE" }
    | { type: "ERROR"; error: ErrorContext };

/**
 * Handles how that state changes in the `useAuth` hook.
 */
export const reducer = (state: AuthState, action: Action): AuthState => {
    switch (action.type) {
        case "INITIALISED":
        case "USER_LOADED":
            return {
                ...state,
                user: action.user,
                isLoading: false,
                isAuthenticated: action.user ? !action.user.expired : false,
                error: undefined,
            };
        case "USER_SIGNED_OUT":
        case "USER_UNLOADED":
            return {
                ...state,
                user: undefined,
                isAuthenticated: false,
            };
        case "NAVIGATOR_INIT":
            return {
                ...state,
                isLoading: true,
                activeNavigator: action.method,
            };
        case "NAVIGATOR_CLOSE":
            // we intentionally don't handle cases where multiple concurrent navigators are open
            return {
                ...state,
                isLoading: false,
                activeNavigator: undefined,
            };
        case "ERROR": {
            const error = action.error;
            error["toString"] = () => `${error.name}: ${error.message}`;
            return {
                ...state,
                isLoading: false,
                error,
            };
        }
        default: {
            const innerError = new TypeError(`unknown type ${action["type"] as string}`);
            const error = {
                name: innerError.name,
                message: innerError.message,
                innerError,
                stack: innerError.stack,
                source: "unknown",
            } satisfies ErrorContext;
            error["toString"] = () => `${error.name}: ${error.message}`;
            return {
                ...state,
                isLoading: false,
                error,
            };
        }
    }
};
