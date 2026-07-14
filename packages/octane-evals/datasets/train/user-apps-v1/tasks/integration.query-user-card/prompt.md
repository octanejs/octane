# Build a TanStack Query user card

Implement `App` in `src/App.tsrx` with `@octanejs/tanstack-query`.

`App` receives a `QueryClient`, a `userId`, and an injected
`loadUser(userId)` function. Provide the client with `QueryClientProvider` and
load the user with `useQuery`. Use a query key that includes the current user
ID so changing `userId` loads and displays the new user. Disable retries.

While unresolved, render `Loading user…` with `role="status"`. On success,
render the user's name as a heading and their email. On failure, render
`Could not load user: message` with `role="alert"`. Do not call the loader
outside the query, create a replacement client, or mirror query data into local
state. Only edit `src/App.tsrx`.
