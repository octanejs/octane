// Ported from @apollo/client@4.2.6 src/react/context/__tests__/ApolloProvider.test.tsx
// at commit f934b60720fc828a61e04b00988eeefb83d273bc for the Octane test renderer.
import { render, screen } from '@octanejs/testing-library';
import { useContext } from 'octane';
import { describe, expect, it } from 'vitest';
import { EMPTY } from 'rxjs';
import { ApolloClient, InMemoryCache as Cache, ApolloLink } from '@apollo/client';
import { ApolloProvider, getApolloContext } from '@octanejs/apollo-client/react';
import type { ApolloContextValue } from '../../../src/react/context/ApolloContext.js';

describe('<ApolloProvider /> Component', () => {
	const client = new ApolloClient({
		cache: new Cache(),
		link: new ApolloLink(function forwardOrEmpty(operation, forward) {
			return forward ? forward(operation) : EMPTY;
		}),
	});

	const anotherClient = new ApolloClient({
		cache: new Cache(),
		link: new ApolloLink(function forwardOrEmpty(operation, forward) {
			return forward ? forward(operation) : EMPTY;
		}),
	});

	it('should render children components', () => {
		render(
			<ApolloProvider client={client}>
				<div className="unique">Test</div>
			</ApolloProvider>,
		);

		expect(screen.getByText('Test')).toBeTruthy();
	});

	it('should support the 2.0', () => {
		render(
			<ApolloProvider client={{} as ApolloClient}>
				<div className="unique">Test</div>
			</ApolloProvider>,
		);

		expect(screen.getByText('Test')).toBeTruthy();
	});

	it('should require a client', () => {
		const originalConsoleError = console.error;
		console.error = function noop() {
			/* noop */
		};
		expect(function renderWithoutClient() {
			// Before testing `ApolloProvider`, we first fully reset the
			// existing context using `ApolloContext.Provider` directly.
			const ApolloContext = getApolloContext();
			render(
				<ApolloContext.Provider value={{}}>
					<ApolloProvider client={undefined as any}>
						<div className="unique" />
					</ApolloProvider>
				</ApolloContext.Provider>,
			);
		}).toThrow(
			'ApolloProvider was not passed a client instance. Make ' +
				'sure you pass in your client via the "client" prop.',
		);
		console.error = originalConsoleError;
	});

	it('should not require a store', () => {
		render(
			<ApolloProvider client={client}>
				<div className="unique">Test</div>
			</ApolloProvider>,
		);
		expect(screen.getByText('Test')).toBeTruthy();
	});

	it('should add the client to the children context', () => {
		function TestChild() {
			const context = useContext(getApolloContext());
			expect(context.client).toEqual(client);
			return null;
		}
		render(
			<ApolloProvider client={client}>
				<TestChild />
				<TestChild />
			</ApolloProvider>,
		);
	});

	it('should update props when the client changes', () => {
		let clientToCheck = client;

		function TestChild() {
			const context = useContext(getApolloContext());
			expect(context.client).toEqual(clientToCheck);
			return null;
		}
		const { rerender } = render(
			<ApolloProvider client={clientToCheck}>
				<TestChild />
			</ApolloProvider>,
		);

		const newClient = new ApolloClient({
			cache: new Cache(),
			link: new ApolloLink(function forwardOrEmpty(operation, forward) {
				return forward ? forward(operation) : EMPTY;
			}),
		});
		clientToCheck = newClient;
		rerender(
			<ApolloProvider client={clientToCheck}>
				<TestChild />
			</ApolloProvider>,
		);
	});

	describe.each(
		[
			['client', { client }, { client: anotherClient }],
		] as const,
	)('context value stability, %s prop', function suite(prop, value, childValue) {
		it(`should not recreate the context value if the ${prop} prop didn't change`, () => {
			let lastContext: ApolloContextValue | undefined;

			function TestChild() {
				lastContext = useContext(getApolloContext());
				return null;
			}

			const { rerender } = render(
				<ApolloProvider {...value}>
					<TestChild />
				</ApolloProvider>,
			);

			const firstContextValue = lastContext;

			rerender(
				<ApolloProvider {...value}>
					<TestChild />
				</ApolloProvider>,
			);

			expect(lastContext).toBe(firstContextValue);
		});

		it(
			`should not recreate the context if the parent context value differs, but the ${prop} prop didn't change`,
			() => {
				let lastContext: ApolloContextValue | undefined;

				function TestChild() {
					lastContext = useContext(getApolloContext());
					return null;
				}

				const { rerender } = render(
					<ApolloProvider {...value}>
						<ApolloProvider {...childValue}>
							<TestChild />
						</ApolloProvider>
					</ApolloProvider>,
				);

				const firstContextValue = lastContext;

				rerender(
					<ApolloProvider {...value}>
						<ApolloProvider {...childValue}>
							<TestChild />
						</ApolloProvider>
					</ApolloProvider>,
				);

				expect(lastContext).toBe(firstContextValue);
			},
		);
	});
});
