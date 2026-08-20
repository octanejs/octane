import React from "react";
import type { SigninRedirectArgs } from "oidc-client-ts";

import { useAuth } from "./useAuth";
import { hasAuthParams } from "./utils";

/**
 * @public
 */
export interface WithAuthenticationRequiredProps {
    /**
     * Show a message when redirected to the signin page.
     */
    OnRedirecting?: () => React.JSX.Element;

    /**
     * Allows executing logic before the user is redirected to the signin page.
     */
    onBeforeSignin?: () => Promise<void> | void;

    /**
     * Pass additional signin redirect arguments.
     */
    signinRedirectArgs?: SigninRedirectArgs;
}

/**
 * A public higher-order component to protect accessing not public content. When you wrap your components in this higher-order
 * component and an anonymous user visits your component, they will be redirected to the login page; after logging in, they
 * will return to the page from which they were redirected.
 *
 * @public
 */
export const withAuthenticationRequired = <P extends object>(
    Component: React.ComponentType<P>,
    options: WithAuthenticationRequiredProps = {},
): React.FC<P> => {
    const { OnRedirecting = (): React.JSX.Element => <></>, onBeforeSignin, signinRedirectArgs } = options;
    const displayName = `withAuthenticationRequired(${Component.displayName || Component.name})`;
    const C: React.FC<P> = (props) => {
        const auth = useAuth();

        React.useEffect(() => {
            if (hasAuthParams() ||
                auth.isLoading || auth.activeNavigator || auth.isAuthenticated) {
                return;
            }
            void (async (): Promise<void> => {
                if (onBeforeSignin) await onBeforeSignin();
                await auth.signinRedirect(signinRedirectArgs);
            })();
        }, [auth.isLoading, auth.isAuthenticated, auth]);

        return auth.isAuthenticated ? <Component {...props} /> : OnRedirecting();
    };

    C.displayName = displayName;

    return C;
};
