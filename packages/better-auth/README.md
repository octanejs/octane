# @octanejs/better-auth

[Better Auth](https://github.com/better-auth/better-auth) client bindings for the
[Octane](https://github.com/octanejs/octane) UI framework.

## Installation

```sh
npm install @octanejs/better-auth
pnpm add @octanejs/better-auth
```

Better Auth keeps its authentication client and session state framework-agnostic.
This package reuses that public vanilla client unchanged and adapts its Nanostores
atoms to Octane's `useSyncExternalStore`. Endpoint actions, plugins, `$fetch`,
`$store`, `$ERROR_CODES`, and `$Infer` retain Better Auth's inferred types.

```ts
// auth-client.ts
import { createAuthClient } from '@octanejs/better-auth';

export const authClient = createAuthClient();
```

```tsx
// Account.tsrx
import { authClient } from './auth-client';

export function Account() @{
  const { data: session, isPending } = authClient.useSession();

  @if (isPending) {
    <p>Loading…</p>
  } @else if (session) {
    <p>Signed in as {session.user.name}</p>
  } @else {
    <button onClick={() => authClient.signIn.social({ provider: 'github' })}>
      Sign in
    </button>
  }
}
```

Plugin-provided atoms become hooks in the same way as `better-auth/react`. For
example, an `activeOrganization` atom is exposed as
`authClient.useActiveOrganization()`.

The server-side Better Auth configuration remains unchanged because
`auth.handler(request)` consumes and returns standard Fetch API objects. Framework
helpers that explicitly import React framework packages, such as
`better-auth/tanstack-start`, are not re-exported by this binding.

## Exports

- `createAuthClient` creates an Octane-bound Better Auth client.
- `useStore` subscribes an Octane component to any Nanostore and supports the
  upstream `keys` and `deps` options.
- Better Auth client types and utility types are re-exported from
  `better-auth/client`.

## Status

Current scope, divergences, and verification are tracked in the generated
[bindings status table](../../docs/bindings-status.md), sourced from this
package's [`status.json`](./status.json).
