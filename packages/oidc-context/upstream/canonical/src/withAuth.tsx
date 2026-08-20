import React from "react";

import type { AuthContextProps } from "./AuthContext";
import { useAuth } from "./useAuth";

/**
 * A public higher-order component to access the imperative API
 * @public
 */
export function withAuth<P>(
    Component: React.ComponentType<P>,
): React.ComponentType<Omit<P, keyof AuthContextProps>> {
    const displayName = `withAuth(${Component.displayName || Component.name})`;
    const C: React.FC<Omit<P, keyof AuthContextProps>> = (props) => {
        const auth = useAuth();

        return <Component {...(props as P)} auth={auth} />;
    };

    C.displayName = displayName;

    return C;
}
