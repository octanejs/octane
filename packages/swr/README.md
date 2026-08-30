# @octanejs/swr

SWR 2.4.2 for [Octane](https://github.com/octanejs/octane). The binding preserves
the root API plus `infinite`, `immutable`, `mutation`, `subscription`, `_internal`,
and the upstream package's conditional server entry points.

## Installation

```sh
npm install @octanejs/swr
pnpm add @octanejs/swr
```

```tsx
import useSWR, { mutate } from '@octanejs/swr'

const fetcher = async (key: string) => ({ key, title: 'Octane' })

export function Profile() @{
  const { data, isLoading } = useSWR('/api/profile', fetcher)

  <section>
    <p>{isLoading ? 'Loading…' : data?.title}</p>
    <button
      onClick={() =>
        mutate('/api/profile', current => ({ ...current!, title: 'Updated' }), false)
      }
    >
      {'Rename'}
    </button>
  </section>
}
```

## Migration

Replace each `swr` import root with its mapped Octane package. The public names,
arguments, return values, overloads, cache keys, and configuration names remain
the same.

| React import | Octane import |
| --- | --- |
| `swr` | `@octanejs/swr` |
| `swr/infinite` | `@octanejs/swr/infinite` |
| `swr/immutable` | `@octanejs/swr/immutable` |
| `swr/mutation` | `@octanejs/swr/mutation` |
| `swr/subscription` | `@octanejs/swr/subscription` |
| `swr/_internal` | `@octanejs/swr/_internal` |

The package does not provide a `swr` module alias. Change import specifiers as
part of the normal React-to-Octane source conversion.

## Cache, SSR, and hydration

The default cache is process-global, as in upstream SWR. Use `SWRConfig` with a
`provider` when requests must be isolated per application, test, tenant, or
server request. Server entry points are browser-global-free and preserve the
upstream export omissions. Seed deterministic server output with `fallback` or
`fallbackData`; hydration adopts that data and then follows the named
`revalidateOnMount`, `revalidateIfStale`, Suspense, preload, and key-change
options. Fallback data does not universally disable mount revalidation.

SWR 2.4.2 does not automatically abort an in-flight fetch when its consumer
unmounts. If cancellation matters, implement it in the fetcher with an
`AbortController` and a lifecycle appropriate to the application.

## Trusted callbacks and devtools

Fetchers, middleware, cache providers, subscription setup/disposers, retry
callbacks, and mutation callbacks are executable application code. Treat them
as trusted code; validate untrusted keys and payloads before they reach those
boundaries.

Array-valued `window.__SWR_DEVTOOLS_USE__` middleware is preserved in order. The
binding identifies itself through `window.__SWR_DEVTOOLS_OCTANE__` and does not
claim React's `window.__SWR_DEVTOOLS_REACT__` global. React-only devtools that
require that global are not compatible. Hostile accessors and non-array ambient
values are ignored without evaluation.

## Verification and license

The global parity harness executes the pinned React Jest suite, three unchanged
upstream TypeScript projects, three adapted Octane type projects, and the full
adapted runtime inventory. See [`audit/react-parity.json`](./audit/react-parity.json)
and [`UPSTREAM.md`](./UPSTREAM.md).

MIT — contains source derived from [SWR](https://github.com/vercel/swr)
(MIT, © 2023 Vercel, Inc.), adapted for Octane.
