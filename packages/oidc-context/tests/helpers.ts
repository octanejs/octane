// Per packages/oidc-context/upstream/canonical/test/helpers.tsx
import { createElement, type OctaneNode } from 'octane';

import { AuthProvider, type AuthProviderProps } from '../src/AuthProvider';

export function createWrapper(opts: AuthProviderProps) {
	// OCTANE DIVERGENCE: Octane has no StrictMode double-invoke wrapper.
	function AllProviders(props: { children?: OctaneNode }): OctaneNode {
		return createElement(AuthProvider, opts, props.children);
	}
	return AllProviders;
}

export function createLocation(search: string, hash: string): Location {
	const location: Location = {
		search,
		hash,
		host: 'www.example.com',
		protocol: 'https:',
		ancestorOrigins: {} as DOMStringList,
		href: '',
		hostname: '',
		origin: '',
		pathname: '',
		port: '80',
		assign: function assign() {},
		reload: function reload() {},
		replace: function replace() {},
	};
	return location;
}
