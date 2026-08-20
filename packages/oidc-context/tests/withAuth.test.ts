// Per packages/oidc-context/upstream/canonical/test/withAuth.test.tsx
import { createElement, type OctaneNode } from 'octane';
import { render, screen } from '@octanejs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { AuthProvider, withAuth } from '../src';
import type { AuthContextProps } from '../src/AuthContext';

vi.mock('oidc-client-ts', function () {
	return import('./_mocks/oidc-client-ts');
});

const settingsStub = { authority: 'authority', client_id: 'client', redirect_uri: 'redirect' };

describe('withAuth', function () {
	it('should wrap a class component, adding AuthContextProps to the component\'s `auth` prop', async function () {
		// OCTANE DIVERGENCE: Octane has no class components; the HOC wraps a function component.
		function MyComponent(props: { auth?: AuthContextProps }): OctaneNode {
			if (props.auth) {
				return createElement('span', null, 'auth: ' + Object.keys(props.auth).join(' '));
			}
			return null;
		}

		const WrappedComponent = withAuth(MyComponent);
		render(
			createElement(AuthProvider, settingsStub, createElement(WrappedComponent)),
		);
		expect(await screen.findByText(/auth/)).toBeTruthy();
		expect(await screen.findByText(/signinRedirect/)).toBeTruthy();
	});

	it('should pass through wrapped component props', async function () {
		function MyPropsComponent(props: { originalProp: string; auth?: AuthContextProps }): OctaneNode {
			return createElement('span', null, 'originalPropValue: ' + props.originalProp);
		}

		const WrappedComponent = withAuth(MyPropsComponent);
		render(
			createElement(
				AuthProvider,
				settingsStub,
				createElement(WrappedComponent, { originalProp: 'myvalue' }),
			),
		);
		expect(await screen.findByText('originalPropValue: myvalue')).toBeTruthy();
	});
});
