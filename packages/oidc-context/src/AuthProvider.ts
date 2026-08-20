import type { ProcessResourceOwnerPasswordCredentialsArgs, SignoutResponse } from 'oidc-client-ts';
import { User, UserManager, type UserManagerSettings } from 'oidc-client-ts';
import {
	createElement,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
	type OctaneNode,
} from 'octane';

import { AuthContext, type AuthContextProps } from './AuthContext';
import { type ErrorContext, initialAuthState } from './AuthState';
import { splitSlot, subSlot } from './internal';
import { reducer } from './reducer';
import {
	hasAuthParams,
	normalizeError,
	renewSilentError,
	signinError,
	signoutError,
} from './utils';

/**
 * @public
 */
export interface AuthProviderBaseProps {
	/**
	 * The child nodes your Provider has wrapped
	 */
	children?: OctaneNode;

	/**
	 * On sign in callback hook. Can be a async function.
	 * Here you can remove the code and state parameters from the url when you are redirected from the authorize page.
	 */
	onSigninCallback?: (user: User | undefined) => Promise<void> | void;

	/**
	 * By default, if the page url has code/state params, this provider will call automatically the `userManager.signinCallback`.
	 * In some cases the code might be for something else (another OAuth SDK perhaps). In these
	 * instances you can instruct the client to ignore them.
	 */
	skipSigninCallback?: boolean;

	/**
	 * Match the redirect uri used for logout (e.g. `post_logout_redirect_uri`)
	 * This provider will then call automatically the `userManager.signoutCallback`.
	 */
	matchSignoutCallback?: (args: UserManagerSettings) => boolean;

	/**
	 * On sign out callback hook. Can be a async function.
	 * Here you can change the url after the user is signed out.
	 * When using this, specifying `matchSignoutCallback` is required.
	 */
	onSignoutCallback?: (resp: SignoutResponse | undefined) => Promise<void> | void;

	/**
	 * On remove user hook. Can be a async function.
	 * Here you can change the url after the user is removed.
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
	'clearStaleState',
	'querySessionStatus',
	'revokeTokens',
	'startSilentRenew',
	'stopSilentRenew',
] as const;
const navigatorKeys = [
	'signinPopup',
	'signinSilent',
	'signinRedirect',
	'signinResourceOwnerCredentials',
	'signoutPopup',
	'signoutRedirect',
	'signoutSilent',
] as const;

function unsupportedEnvironment(fnName: string) {
	return function unsupported() {
		throw new Error(
			`UserManager#${fnName} was called from an unsupported context. If this is a server-rendered page, defer this call with useEffect() or pass a custom UserManager implementation.`,
		);
	};
}

const UserManagerImpl = typeof window === 'undefined' ? null : UserManager;

type NavigatorKey = (typeof navigatorKeys)[number];
type ContextKey = (typeof userManagerContextKeys)[number];
type Dispatch = (action: Parameters<typeof reducer>[1]) => void;

function bindContextMethod(userManager: UserManager, key: ContextKey): unknown {
	const method = userManager[key];
	if (method) {
		return method.bind(userManager);
	}
	return unsupportedEnvironment(key);
}

function bindNavigatorMethod(userManager: UserManager, key: NavigatorKey, dispatch: Dispatch) {
	const method = userManager[key];
	if (!method) {
		return unsupportedEnvironment(key);
	}
	return async function navigator(args: ProcessResourceOwnerPasswordCredentialsArgs & never[]) {
		dispatch({
			type: 'NAVIGATOR_INIT',
			method: key,
		});
		try {
			return await userManager[key](args);
		} catch (error) {
			dispatch({
				type: 'ERROR',
				error: {
					...normalizeError(error, `Unknown error while executing ${key}(...).`),
					source: key,
					args: args,
				} as ErrorContext,
			});
			return null;
		} finally {
			dispatch({ type: 'NAVIGATOR_CLOSE' });
		}
	};
}

/**
 * Provides the AuthContext to its child components.
 *
 * @public
 */
export function AuthProvider(props: AuthProviderProps, ...rest: unknown[]): OctaneNode {
	const [, slot] = splitSlot(rest);
	const children = props.children;
	const onSigninCallback = props.onSigninCallback;
	const skipSigninCallback = props.skipSigninCallback;
	const matchSignoutCallback = props.matchSignoutCallback;
	const onSignoutCallback = props.onSignoutCallback;
	const onRemoveUser = props.onRemoveUser;
	const userManagerProp = props.userManager ?? null;
	const userManagerSettings = { ...props } as UserManagerSettings & AuthProviderBaseProps;
	delete (userManagerSettings as AuthProviderBaseProps).children;
	delete (userManagerSettings as AuthProviderBaseProps).onSigninCallback;
	delete (userManagerSettings as AuthProviderBaseProps).skipSigninCallback;
	delete (userManagerSettings as AuthProviderBaseProps).matchSignoutCallback;
	delete (userManagerSettings as AuthProviderBaseProps).onSignoutCallback;
	delete (userManagerSettings as AuthProviderBaseProps).onRemoveUser;
	delete (userManagerSettings as AuthProviderUserManagerProps).userManager;

	const [userManager] = useState(
		function createManager() {
			return (
				userManagerProp ??
				(UserManagerImpl
					? new UserManagerImpl(userManagerSettings as UserManagerSettings)
					: ({ settings: userManagerSettings } as UserManager))
			);
		},
		subSlot(slot, 'manager'),
	);

	const [state, dispatch] = useReducer(reducer, initialAuthState, subSlot(slot, 'state'));
	const userManagerContext = useMemo(
		function buildContext() {
			const contextMethods: Record<string, unknown> = {
				settings: userManager.settings,
				events: userManager.events,
			};
			for (let i = 0; i < userManagerContextKeys.length; i++) {
				const key = userManagerContextKeys[i];
				contextMethods[key] = bindContextMethod(userManager, key);
			}
			for (let j = 0; j < navigatorKeys.length; j++) {
				const key = navigatorKeys[j];
				contextMethods[key] = bindNavigatorMethod(userManager, key, dispatch);
			}
			return contextMethods;
		},
		[userManager],
		subSlot(slot, 'um-context'),
	);
	const didInitialize = useRef(false, subSlot(slot, 'init'));

	useEffect(
		function initializeAuth() {
			if (!userManager || didInitialize.current) {
				return;
			}
			didInitialize.current = true;

			void (async function runInitialize() {
				// sign-in
				try {
					let user: User | undefined | null = null;

					// check if returning back from authority server
					if (hasAuthParams() && !skipSigninCallback) {
						user = await userManager.signinCallback();
						if (onSigninCallback) await onSigninCallback(user);
					}
					user = !user ? await userManager.getUser() : user;
					dispatch({ type: 'INITIALISED', user });
				} catch (error) {
					dispatch({
						type: 'ERROR',
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
						type: 'ERROR',
						error: signoutError(error),
					});
				}
			})();
		},
		[userManager, skipSigninCallback, onSigninCallback, onSignoutCallback, matchSignoutCallback],
		subSlot(slot, 'init-effect'),
	);

	useEffect(
		function registerEvents() {
			if (!userManager) return undefined;
			function handleUserLoaded(user: User) {
				dispatch({ type: 'USER_LOADED', user });
			}
			userManager.events.addUserLoaded(handleUserLoaded);

			function handleUserUnloaded() {
				dispatch({ type: 'USER_UNLOADED' });
			}
			userManager.events.addUserUnloaded(handleUserUnloaded);

			function handleUserSignedOut() {
				dispatch({ type: 'USER_SIGNED_OUT' });
			}
			userManager.events.addUserSignedOut(handleUserSignedOut);

			function handleSilentRenewError(error: Error) {
				dispatch({
					type: 'ERROR',
					error: renewSilentError(error),
				});
			}
			userManager.events.addSilentRenewError(handleSilentRenewError);

			return function unsubscribe() {
				userManager.events.removeUserLoaded(handleUserLoaded);
				userManager.events.removeUserUnloaded(handleUserUnloaded);
				userManager.events.removeUserSignedOut(handleUserSignedOut);
				userManager.events.removeSilentRenewError(handleSilentRenewError);
			};
		},
		[userManager],
		subSlot(slot, 'events'),
	);

	const removeUser = useCallback(
		async function removeUserFn() {
			if (!userManager) unsupportedEnvironment('removeUser');
			await userManager.removeUser();
			if (onRemoveUser) await onRemoveUser();
		},
		[userManager, onRemoveUser],
		subSlot(slot, 'remove'),
	);

	const contextValue = useMemo(
		function mergeContext() {
			return {
				...state,
				...userManagerContext,
				removeUser,
			};
		},
		[state, userManagerContext, removeUser],
		subSlot(slot, 'value'),
	);

	return createElement(AuthContext.Provider, { value: contextValue as AuthContextProps }, children);
}
