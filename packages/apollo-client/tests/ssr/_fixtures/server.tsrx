import { gql, type ApolloClient } from '@apollo/client';
import { ApolloProvider, useQuery } from '@octanejs/apollo-client/react';

export const GET_SERVER_VALUE = gql`
	query GetServerValue {
		value
	}
`;

export const GET_NESTED_VALUE = gql`
	query GetNestedValue {
		nestedValue
	}
`;

export interface ApolloServerFixtureProps {
	client: ApolloClient;
	ssr?: boolean;
	fetchPolicy?: 'cache-first' | 'no-cache';
}

function ServerValue(props: ApolloServerFixtureProps) @{
	const result = useQuery(GET_SERVER_VALUE, {
		ssr: props.ssr,
		fetchPolicy: props.fetchPolicy,
	});
	const value = (result.data as { value?: string } | undefined)?.value;
	<main id="apollo-server">
		<output id="apollo-server-value">
			{result.loading ? 'loading' : result.error ? 'error' : 'data:' + (value ?? '-')}
		</output>
		<button
			id="apollo-update-cache"
			onClick={() => props.client.writeQuery({ query: GET_SERVER_VALUE, data: { value: 'updated' } })}
		>
			Update cache
		</button>
	</main>
}

export function ApolloServerFixture(props: ApolloServerFixtureProps) @{
	<ApolloProvider client={props.client}>
		<ServerValue {...props} />
	</ApolloProvider>
}

function NestedValue() @{
	const result = useQuery(GET_NESTED_VALUE);
	const value = (result.data as { nestedValue?: string } | undefined)?.nestedValue;
	<output id="apollo-nested-value">
		{result.loading ? 'loading' : 'nested:' + (value ?? '-')}
	</output>
}

function WaterfallValue() @{
	const result = useQuery(GET_SERVER_VALUE);
	const value = (result.data as { value?: string } | undefined)?.value;
	<section id="apollo-waterfall">
		<output id="apollo-parent-value">{result.loading ? 'loading' : 'data:' + (value ?? '-')}</output>
		@if (!result.loading && value) {
			<NestedValue />
		}
	</section>
}

export function ApolloWaterfallFixture(props: { client: ApolloClient }) @{
	<ApolloProvider client={props.client}>
		<WaterfallValue />
	</ApolloProvider>
}

export function ApolloStyledFixture(props: { client: ApolloClient }) @{
	<ApolloProvider client={props.client}>
		<section class="apollo-server-styled">
			<ServerValue client={props.client} />
			<style>
				.apollo-server-styled {
					color: rgb(17, 34, 51);
				}
			</style>
		</section>
	</ApolloProvider>
}
