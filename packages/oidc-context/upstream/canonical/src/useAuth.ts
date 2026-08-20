import React from "react";

import { AuthContext, type AuthContextProps } from "./AuthContext";

/**
 * @public
 */
export const useAuth = (): AuthContextProps => {
    const context = React.useContext(AuthContext);

    if (!context) {
        console.warn("AuthProvider context is undefined, please verify you are calling useAuth() as child of a <AuthProvider> component.");
    }

    return context as AuthContextProps;
};
