# @octanejs/zero

[Rocicorp Zero](https://zero.rocicorp.dev/) bindings for the
[Octane](https://github.com/octanejs/octane) UI framework.

The package reuses the framework-neutral `@rocicorp/zero` client. It ports the
provider, query, connection-state, and online-state bindings from
`@rocicorp/zero/react` to Octane hooks.

```tsrx
import { Zero } from '@rocicorp/zero';
import { ZeroProvider, useQuery, useZero } from '@octanejs/zero';

const zero = new Zero({ cacheURL, userID, schema });

function IssueList() @{
	const z = useZero();
	const [issues] = useQuery(z.query.issue.orderBy('created', 'desc'));

	<ul>
		@for (const issue of issues; key issue.id) {
			<li>{issue.title as string}</li>
		}
	</ul>
}

function App() @{
	<ZeroProvider zero={zero}>
		<IssueList />
	</ZeroProvider>
}
```

## Compatibility

This release targets exactly `@rocicorp/zero@1.8.0`. Import Zero schemas,
queries, mutations, and the client from `@rocicorp/zero`. Import UI bindings
from `@octanejs/zero`.

The package ports the public `@rocicorp/zero/react` surface:

- `ZeroProvider`, `ZeroContext`, `useZero`, and `createUseZero`;
- `useQuery` and `useSuspenseQuery`;
- `useConnectionState` and the deprecated `useZeroOnline` compatibility hook;
- the public provider, query-result, and query-options types.

`useSuspenseQuery` integrates through Octane's `use()` implementation. Zero
still does not load query data during server rendering. A provider constructed
from options creates its client in a passive effect, as the upstream binding
does.

See [`UPSTREAM.md`](./UPSTREAM.md) for the immutable source pin, export
crosswalk, test disposition, and known differences.
