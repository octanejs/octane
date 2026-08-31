# @octanejs/sanity-loader

Sanity query loading, Live Mode, and Content Source Map hooks for Octane. It is
the Octane counterpart to `@sanity/react-loader@2.2.1` and delegates the data
layer to Sanity's framework-neutral `@sanity/core-loader` package.

```sh
npm install @octanejs/sanity-loader @sanity/client
pnpm add @octanejs/sanity-loader @sanity/client
```

```ts
import {createQueryStore} from '@octanejs/sanity-loader'

export const {loadQuery, setServerClient, useLiveMode, useQuery} =
  createQueryStore({client: false, ssr: true})
```

Use `loadQuery()` on the server and pass its result as `initial` to `useQuery()`
for hydration. `useLiveMode()` activates Sanity's browser subscription layer.
The `browser` export condition replaces server-only methods with descriptive
errors, while `@octanejs/sanity-loader/rsc` exposes the server-only store.

The upstream experimental `@sanity/react-loader/jsx` data-wrapper subpath is not
part of this first package version. Query loading, live mode, source-map encoding,
and the browser/server split are included.
