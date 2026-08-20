import type { ErrorContext } from "./AuthState";

/**
 * @public
 */
export const hasAuthParams = (location = window.location): boolean => {
    // response_mode: query
    let searchParams = new URLSearchParams(location.search);
    if ((searchParams.get("code") || searchParams.get("error")) &&
        searchParams.get("state")) {
        return true;
    }

    // response_mode: fragment
    searchParams = new URLSearchParams(location.hash.replace("#", "?"));
    if ((searchParams.get("code") || searchParams.get("error")) &&
        searchParams.get("state")) {
        return true;
    }

    return false;
};

export const signinError = normalizeErrorFn("signinCallback", "Sign-in failed");
export const signoutError = normalizeErrorFn("signoutCallback", "Sign-out failed");
export const renewSilentError = normalizeErrorFn("renewSilent", "Renew silent failed");

export function normalizeError(error: unknown, fallbackMessage: string): Pick<ErrorContext, "name" | "message" | "innerError" | "stack"> {
    return {
        name: stringFieldOf(error, "name", () => "Error"),
        message: stringFieldOf(error, "message", () => fallbackMessage),
        stack: stringFieldOf(error, "stack", () => new Error().stack),
        innerError: error,
    };
}

function normalizeErrorFn(source: "signoutCallback" | "signinCallback" | "renewSilent", fallbackMessage: string) {
    return (error: unknown): ErrorContext => {
        return {
            ...normalizeError(error, fallbackMessage),
            source: source,
        };
    };
}

function stringFieldOf(element: unknown, fieldName: string, or: () => string): string;
function stringFieldOf(element: unknown, fieldName: string, or: () => string | undefined): string | undefined;
function stringFieldOf(element: unknown, fieldName: string, or: () => string | undefined): string | undefined {
    if (element && typeof element === "object") {
        const value = (element as Record<string, unknown>)[fieldName];
        if (typeof value === "string") {
            return value;
        }
    }
    return or();
}
