import type { UserManager, UserManagerEvents, UserManagerSettings } from "oidc-client-ts";

const MockUserManager: typeof UserManager = jest.fn(function (this: { events: Partial<UserManagerEvents>; settings: Partial<UserManagerSettings> }, args: UserManagerSettings) {
    this.events = {
        load: jest.fn(),
        unload: jest.fn(),

        addUserLoaded: jest.fn(),
        removeUserLoaded: jest.fn(),

        addUserUnloaded: jest.fn(),
        removeUserUnloaded: jest.fn(),

        addSilentRenewError: jest.fn(),
        removeSilentRenewError: jest.fn(),

        addUserSignedIn: jest.fn(),
        removeUserSignedIn: jest.fn(),

        addUserSignedOut: jest.fn(),
        removeUserSignedOut: jest.fn(),

        addUserSessionChanged: jest.fn(),
        removeUserSessionChanged: jest.fn(),
    };

    this.settings = args;

    return this as UserManager;
});
MockUserManager.prototype.clearStaleState = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.getUser = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.storeUser = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.removeUser = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinPopup = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinPopupCallback = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinSilent = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinSilentCallback = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinRedirect = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinRedirectCallback = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinResourceOwnerCredentials = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutRedirect = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutRedirectCallback = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutPopup = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutPopupCallback = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutSilent = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutSilentCallback = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinCallback = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutCallback = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.querySessionStatus = jest.fn().mockResolvedValue(undefined);
MockUserManager.prototype.revokeTokens = jest.fn();
MockUserManager.prototype.startSilentRenew = jest.fn();
MockUserManager.prototype.stopSilentRenew = jest.fn();

export { MockUserManager as UserManager };
