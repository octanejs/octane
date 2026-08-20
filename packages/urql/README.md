# @octanejs/urql

Octane binding for [`urql@5.0.3`](https://github.com/urql-graphql/urql). Re-exports `@urql/core@6.0.3` and ports the React hooks and render-prop components.

```ts
import { createElement } from 'octane';
import { Client, Provider, cacheExchange, fetchExchange, useQuery, gql } from '@octanejs/urql';

const client = new Client({
	url: 'https://api.example/graphql',
	exchanges: [cacheExchange, fetchExchange],
});

const TodosQuery = gql`
	query {
		todos {
			id
			title
		}
	}
`;

function Todos() {
	const [result] = useQuery({ query: TodosQuery });
	return result.fetching ? 'loading' : JSON.stringify(result.data);
}

export function App() {
	return createElement(Provider, { value: client }, createElement(Todos));
}
```

Suspense still throws a Promise, matching upstream. See `UPSTREAM.md` for the pin and export crosswalk.
