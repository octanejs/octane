import * as Octane from 'octane';

import { ApolloClient } from '@apollo/client';
import { InMemoryCache } from '@apollo/client/cache';
import { MockLink } from '@apollo/client/testing';

import { ApolloProvider } from '../../react/index.js';

/**
 * Octane counterpart to Apollo's class-based MockedProvider. The client is
 * created once for this component instance and stopped when it unmounts.
 */
export function MockedProvider(props) {
	const [client] = Octane.useState(() => {
		const {
			mocks,
			defaultOptions,
			cache,
			localState,
			link,
			showWarnings,
			mockLinkDefaultOptions,
			devtools,
		} = props;

		return new ApolloClient({
			cache: cache || new InMemoryCache(),
			defaultOptions,
			link:
				link ||
				new MockLink(mocks || [], {
					showWarnings,
					defaultOptions: mockLinkDefaultOptions,
				}),
			localState,
			devtools,
		});
	});

	Octane.useEffect(() => () => client.stop(), [client]);

	const { children, childProps } = props;
	if (Octane.isChildrenBlock(children)) {
		return Octane.createElement(ApolloProvider, { client }, children);
	}
	if (!Octane.isValidElement(children)) return null;

	return Octane.createElement(
		ApolloProvider,
		{ client },
		Octane.cloneElement(Octane.Children.only(children), { ...childProps }),
	);
}
