import { ApolloClient, ApolloLink, InMemoryCache, gql } from '@apollo/client';
import { ApolloProvider, useQuery } from '@octanejs/apollo-client/react';

// Each differential side (octane / react) loads this fixture as its own module,
// so each gets an independent ApolloClient + cache — same shape as
// tanstack-query's cached-diff fixture.
const QUERY = gql`
	query DifferentialValue {
		value
	}
`;

const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
client.writeQuery({ query: QUERY, data: { value: 'cached' } });

function QueryPanel() @{
	const result = useQuery(QUERY, { fetchPolicy: 'cache-only' });
	<output id="query-value">
		{result.loading ? 'loading' : 'data:' + ((result.data as any)?.value ?? '-')}
	</output>
}

export function QueryDiff() @{
	<ApolloProvider client={client}>
		<QueryPanel />
	</ApolloProvider>
}
