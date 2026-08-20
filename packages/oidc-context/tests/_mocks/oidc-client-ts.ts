// Per packages/oidc-context/upstream/canonical/test/__mocks__/oidc-client-ts.ts
import { vi } from 'vitest';

type MockManager = {
	events: Record<string, ReturnType<typeof vi.fn>>;
	settings: unknown;
};

const MockUserManager = vi.fn(function MockUserManager(this: MockManager, args: unknown) {
	this.events = {
		load: vi.fn(),
		unload: vi.fn(),
		addUserLoaded: vi.fn(),
		removeUserLoaded: vi.fn(),
		addUserUnloaded: vi.fn(),
		removeUserUnloaded: vi.fn(),
		addSilentRenewError: vi.fn(),
		removeSilentRenewError: vi.fn(),
		addUserSignedIn: vi.fn(),
		removeUserSignedIn: vi.fn(),
		addUserSignedOut: vi.fn(),
		removeUserSignedOut: vi.fn(),
		addUserSessionChanged: vi.fn(),
		removeUserSessionChanged: vi.fn(),
	};
	this.settings = args;
	return this;
});

MockUserManager.prototype.clearStaleState = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.getUser = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.storeUser = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.removeUser = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinPopup = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinPopupCallback = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinSilent = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinSilentCallback = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinRedirect = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinRedirectCallback = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinResourceOwnerCredentials = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutRedirect = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutRedirectCallback = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutPopup = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutPopupCallback = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutSilent = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutSilentCallback = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signinCallback = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.signoutCallback = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.querySessionStatus = vi.fn().mockResolvedValue(undefined);
MockUserManager.prototype.revokeTokens = vi.fn();
MockUserManager.prototype.startSilentRenew = vi.fn();
MockUserManager.prototype.stopSilentRenew = vi.fn();

export { MockUserManager as UserManager };
