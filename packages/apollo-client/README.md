# @octanejs/apollo-client

Apollo Client 4 bindings for Octane. The package reuses Apollo's client, cache,
links, GraphQL types, and testing core unchanged, while porting the published
React hook adapter to Octane's compiler-slotted hooks.

The adapter is pinned and surface-tested against `@apollo/client@4.2.6`.

## Install

```bash
npm install @octanejs/apollo-client @apollo/client graphql rxjs
pnpm add @octanejs/apollo-client @apollo/client graphql rxjs
```

## Use

Apollo 4 keeps its framework-neutral API at the package root and its component
adapter on `/react`. The Octane package mirrors that split:

```ts
import {
	ApolloClient,
	InMemoryCache,
	HttpLink,
	gql,
	type TypedDocumentNode,
} from '@octanejs/apollo-client';
import { ApolloProvider, useQuery } from '@octanejs/apollo-client/react';
```

```tsrx
interface ViewerData {
	viewer: {
		id: string;
		name: string;
	};
}

const client = new ApolloClient({
	cache: new InMemoryCache(),
	link: new HttpLink({ uri: '/graphql' }),
});

const GET_VIEWER: TypedDocumentNode<ViewerData> = gql`
	query Viewer {
		viewer {
			id
			name
		}
	}
`;

function Viewer() @{
	const result = useQuery(GET_VIEWER);

	@if (result.loading) {
		<p>Loading…</p>
	} @else if (result.error) {
		<p>{result.error.message}</p>
	} @else {
		<p>{(result.data?.viewer.name ?? 'Unknown viewer') as string}</p>
	}
}

export function App() @{
	<ApolloProvider client={client}>
		<Viewer />
	</ApolloProvider>
}
```

The complete Apollo 4.2.6 client hook surface is available, including lazy
queries, mutations, subscriptions, fragments, Suspense queries, background and
loadable queries, query references, `skipToken`, and query preloading.

For tests, import Apollo's framework-neutral mocks from
`@octanejs/apollo-client/testing` and the Octane `MockedProvider` from
`@octanejs/apollo-client/testing/react`.

## Server rendering

Apollo's `useQuery` does not suspend, so a single server-rendering pass cannot
wait for network data. Use the Apollo-aware prepass to retain subscriptions,
finish nested queries, and return Octane's final HTML and scoped CSS:

```ts
import { createElement } from 'octane';
import { renderToString } from 'octane/server';
import { prerenderStatic } from '@octanejs/apollo-client/react/ssr';

const rendered = await prerenderStatic({
	tree: createElement(App, { client }),
	renderFunction: renderToString,
});

const { html, css } = rendered.renderFnResult;
const apolloState = client.extract();
```

Create a separate Apollo client for every server request. Restore `apolloState`
into the browser client's `InMemoryCache` before calling `hydrateRoot` so cached
queries adopt the server markup without duplicate network requests. Queries
using `ssr: false` or `fetchPolicy: 'no-cache'` remain client-only, matching
Apollo 4.2.6. Streaming cache patches are not provided.

## Compatibility

- Hooks and public TypeScript overloads track Apollo Client 4.2.6.
- Suspense unwraps Apollo's stable query promises through Octane `use()` rather
  than throwing promises.
- Omitted React dependency arrays that intentionally mean “every render” are
  explicit `null` in the port so Octane does not infer a narrower dependency
  set.
- React Server Components and Apollo's React Compiler output are out of scope.
- `MockedProvider` accepts normal Octane children blocks; use a descriptor-style
  `children={<App />}` prop when `childProps` must be cloned onto the child.
- Apollo-aware buffered SSR is available from `/react/ssr`; streaming cache
  patches remain out of scope.

The adapter sources are derived from Apollo Client at commit
`f934b60720fc828a61e04b00988eeefb83d273bc`, under Apollo's MIT license. Local
changes are limited to Octane imports, hook semantics, Suspense site identity,
the render-phase guard, and the functional `MockedProvider`.
