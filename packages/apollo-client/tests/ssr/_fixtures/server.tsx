/** @jsxImportSource octane */
import { gql, type ApolloClient } from '@apollo/client';
import { ApolloProvider, useQuery } from '@octanejs/apollo-client/react';

import { Scoped } from '../../../../octane/tests/_fixtures/ssr.tsrx';

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

function ServerValue(props: ApolloServerFixtureProps) {
	const result = useQuery(GET_SERVER_VALUE, {
		ssr: props.ssr,
		fetchPolicy: props.fetchPolicy,
	});
	const value = (result.data as { value?: string } | undefined)?.value;

	return (
		<main id="apollo-server">
			<output id="apollo-server-value">
				{result.loading ? 'loading' : result.error ? 'error' : 'data:' + (value ?? '-')}
			</output>
			<button
				id="apollo-update-cache"
				onClick={() =>
					props.client.writeQuery({ query: GET_SERVER_VALUE, data: { value: 'updated' } })
				}
			>
				Update cache
			</button>
		</main>
	);
}

export function ApolloServerFixture(props: ApolloServerFixtureProps) {
	return (
		<ApolloProvider client={props.client}>
			<ServerValue {...props} />
		</ApolloProvider>
	);
}

function NestedValue() {
	const result = useQuery(GET_NESTED_VALUE);
	const value = (result.data as { nestedValue?: string } | undefined)?.nestedValue;

	return (
		<output id="apollo-nested-value">
			{result.loading ? 'loading' : 'nested:' + (value ?? '-')}
		</output>
	);
}

function WaterfallValue() {
	const result = useQuery(GET_SERVER_VALUE);
	const value = (result.data as { value?: string } | undefined)?.value;

	return (
		<section id="apollo-waterfall">
			<output id="apollo-parent-value">
				{result.loading ? 'loading' : 'data:' + (value ?? '-')}
			</output>
			{!result.loading && value ? <NestedValue /> : null}
		</section>
	);
}

export function ApolloWaterfallFixture(props: { client: ApolloClient }) {
	return (
		<ApolloProvider client={props.client}>
			<WaterfallValue />
		</ApolloProvider>
	);
}

export function ApolloStyledFixture(props: { client: ApolloClient }) {
	return (
		<ApolloProvider client={props.client}>
			<section className="apollo-server-styled">
				<ServerValue client={props.client} />
				<Scoped />
			</section>
		</ApolloProvider>
	);
}
