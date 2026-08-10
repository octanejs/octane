// Ported from @apollo/client@4.2.6 src/react/hooks/__tests__/useApolloClient.test.tsx
// at commit f934b60720fc828a61e04b00988eeefb83d273bc for the Octane test renderer.
import { render } from '@octanejs/testing-library';
import { describe, expect, it } from 'vitest';
import { ApolloClient, InMemoryCache, ApolloLink } from '@apollo/client';
import { ApolloProvider, useApolloClient } from '@octanejs/apollo-client/react';
import { InvariantError } from '@apollo/client/utilities/invariant';

describe('useApolloClient Hook', () => {
	it('should return a client instance from the context if available', () => {
		const client = new ApolloClient({
			cache: new InMemoryCache(),
			link: ApolloLink.empty(),
		});

		function App() {
			expect(useApolloClient()).toEqual(client);
			return null;
		}

		render(
			<ApolloProvider client={client}>
				<App />
			</ApolloProvider>,
		);
	});

	it('should error if a client instance can\'t be found in the context', () => {
		function App() {
			expect(function callWithoutProvider() {
				useApolloClient();
			}).toThrow(InvariantError);
			return null;
		}

		render(<App />);
	});
});
