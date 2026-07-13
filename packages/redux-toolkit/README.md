# @octanejs/redux-toolkit

[Redux Toolkit](https://redux-toolkit.js.org) and RTK Query for the
[octane](https://github.com/octanejs/octane) UI framework.

Redux Toolkit's store, reducer, middleware, selector, and RTK Query cache core
are framework-agnostic, so this package re-exports the real
`@reduxjs/toolkit@2.12.0` implementation. The React-specific RTK Query hooks,
`ApiProvider`, and dynamic-middleware dispatch-hook factory are ported onto
octane and `@octanejs/redux`.

Imports migrate by changing only the package name:

```ts
// before
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// after
import { configureStore, createSlice } from '@octanejs/redux-toolkit';
import { createApi, fetchBaseQuery } from '@octanejs/redux-toolkit/query/react';
```

The `/react` compatibility subpaths retain their upstream names even though
their implementation is Octane-backed. All four upstream entry points exist:

- `@octanejs/redux-toolkit`
- `@octanejs/redux-toolkit/react`
- `@octanejs/redux-toolkit/query`
- `@octanejs/redux-toolkit/query/react`

## RTK Query

```tsrx
import { ApiProvider } from '@octanejs/redux-toolkit/query/react';
import { api } from './api';

function Post(props) @{
	const result = api.useGetPostQuery(props.id);
	@if (result.isLoading) { <p>Loading…</p> }
	@else if (result.isError) { <p>Failed</p> }
	@else { <p>{result.data.title as string}</p> }
}

function App() @{
	<ApiProvider api={api}>
		<Post id={1} />
	</ApiProvider>
}
```

For an existing Redux store, configure `api.reducer` and `api.middleware` in
the normal way and use `Provider` from `@octanejs/redux`.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
