import type { ComponentBody } from 'octane';
import type { ApolloClient } from '@apollo/client';
export declare namespace ApolloProvider {
	interface Props {
		client: ApolloClient;
		children?: unknown;
	}
}
export declare const ApolloProvider: ComponentBody<ApolloProvider.Props>;
