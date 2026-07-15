# Cinebase

Cinebase is a usable film and television catalog built in TSRX. It is also the
Wave 1 system fixture for `@octanejs/apollo-client`: each server request owns an
Apollo client and normalized cache, the browser restores that cache before
hydration, and overlapping search variables are deliberately resolved out of
order.

## Product journeys

- Browse six seeded films and series, filter by genre, and search with a
  deep-linkable `?q=` URL.
- Open `/title/:id`, inspect metadata and credits, then save or remove a title.
- Open `/watchlist` directly, persist the device-local list through a reload,
  and return to Discover from the empty state.
- See explicit loading, no-results, offline, GraphQL failure, and retry states.
- Use the critical path with a keyboard; focus rings, landmarks, labels, native
  links, buttons, and a skip link remain available at mobile widths.

The local `/graphql` endpoint accepts real Apollo HTTP operations but answers
from deterministic in-repository data. CI never contacts a live data or asset
service. Searching for `moon` and then `harbor` creates a slow/fast overlap;
the fixture transport deliberately allows both responses to complete after
Apollo unsubscribes the superseded observer, so the journey observes `harbor`
first and the late `moon` response. Searching for `outage` returns one
recoverable GraphQL error.

## Rendering contract

The server preloads the current route into a fresh `InMemoryCache`, serializes
only that request’s cache, and renders through Octane’s
`renderToPipeableStream`. The primary route is real server content. A delayed
Cinebase Journal Suspense boundary follows as a streamed segment. The client
restores Apollo state and calls `hydrateRoot` over the same component tree.

The SSR journey observes visible server titles and the streamed editorial,
captures the server search node, types before an opt-in delayed hydration, and
then proves node identity, input state, clean hydration diagnostics, and live
post-hydration events. This is deliberately consumer-observable evidence; it
does not inspect compiler helpers or hydration markers.

## Commands

```bash
pnpm --dir examples/cinebase typecheck
pnpm --dir examples/cinebase build
pnpm --dir examples/cinebase dev
pnpm --dir examples/cinebase test:e2e
```

`dev` uses Vite middleware for source transforms and listens on `PORT` (5222 by
default). The E2E suite builds the production client, allocates a local port,
and boots the streaming server with `CINEBASE_DIST=1`. The inline environment
syntax used by that browser command targets the repository’s supported
macOS/Linux development and Ubuntu CI environments. Set
`CINEBASE_E2E_BASE_URL` to drive an already-running deployment instead.

## Octane evidence

- Real `ApolloProvider`, `useQuery`, and `useReactiveVar` binding behavior
- Variable-keyed Apollo cache isolation under out-of-order responses
- TSRX keyed grids and native delegated input/click events
- Streaming Suspense SSR with request-local data
- Server DOM adoption, preserved form state, and post-hydration navigation
- Responsive and keyboard-complete product journeys
