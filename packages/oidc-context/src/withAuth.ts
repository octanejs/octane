import { createElement, type ComponentBody, type OctaneNode } from 'octane';

import type { AuthContextProps } from './AuthContext';
import { useAuth } from './useAuth';
import { splitSlot, subSlot } from './internal';

/**
 * A public higher-order component to access the imperative API
 * @public
 */
export function withAuth<P>(
	Component: ComponentBody<P & { auth: AuthContextProps }>,
): ComponentBody<Omit<P, keyof AuthContextProps>> {
	const displayName = `withAuth(${Component.displayName || Component.name})`;
	function WithAuth(
		props: Omit<P, keyof AuthContextProps>,
		...rest: unknown[]
	): OctaneNode {
		const [, slot] = splitSlot(rest);
		const auth = useAuth(subSlot(slot, 'auth'));
		return createElement(Component, { ...(props as P), auth });
	}

	WithAuth.displayName = displayName;

	return WithAuth;
}
