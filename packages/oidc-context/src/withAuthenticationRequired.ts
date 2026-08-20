import { createElement, useEffect, type ComponentBody, type OctaneNode } from 'octane';
import type { SigninRedirectArgs } from 'oidc-client-ts';

import { useAuth } from './useAuth';
import { hasAuthParams } from './utils';
import { splitSlot, subSlot } from './internal';

/**
 * @public
 */
export interface WithAuthenticationRequiredProps {
	/**
	 * Show a message when redirected to the signin page.
	 */
	OnRedirecting?: () => OctaneNode;

	/**
	 * Allows executing logic before the user is redirected to the signin page.
	 */
	onBeforeSignin?: () => Promise<void> | void;

	/**
	 * Pass additional signin redirect arguments.
	 */
	signinRedirectArgs?: SigninRedirectArgs;
}

function defaultOnRedirecting(): OctaneNode {
	return null;
}

/**
 * A public higher-order component to protect accessing not public content. When you wrap your components in this higher-order
 * component and an anonymous user visits your component, they will be redirected to the login page; after logging in, they
 * will return to the page from which they were redirected.
 *
 * @public
 */
export function withAuthenticationRequired<P extends object>(
	Component: ComponentBody<P>,
	options: WithAuthenticationRequiredProps = {},
): ComponentBody<P> {
	const OnRedirecting = options.OnRedirecting ?? defaultOnRedirecting;
	const onBeforeSignin = options.onBeforeSignin;
	const signinRedirectArgs = options.signinRedirectArgs;
	const displayName = `withAuthenticationRequired(${Component.name || 'Component'})`;
	function WithAuthenticationRequired(props: P, ...rest: unknown[]): OctaneNode {
		const [, slot] = splitSlot(rest);
		const auth = useAuth(subSlot(slot, 'auth'));

		useEffect(
			function redirectAnonymous() {
				if (hasAuthParams() || auth.isLoading || auth.activeNavigator || auth.isAuthenticated) {
					return;
				}
				void (async function signin() {
					if (onBeforeSignin) await onBeforeSignin();
					await auth.signinRedirect(signinRedirectArgs);
				})();
			},
			[auth.isLoading, auth.isAuthenticated, auth],
			subSlot(slot, 'effect'),
		);

		return auth.isAuthenticated ? createElement(Component, props) : OnRedirecting();
	}

	WithAuthenticationRequired.displayName = displayName;

	return WithAuthenticationRequired;
}
