# Nano Stores Octane

<img align="right" width="92" height="92" title="Nano Stores logo"
     src="https://nanostores.github.io/nanostores/logo.svg">

**[Octane]** integration for **[Nano Stores]**, a tiny state manager
with many atomic tree-shakable stores. The framework-agnostic `nanostores`
core is reused unchanged, and the `useStore` binding is built on
octane's hooks (`useSyncExternalStore`, `useCallback`, `useRef`).

- **Small.** Less than 1 KB. Zero dependencies.
- **Fast.** With small atomic and derived stores, you do not need to call
  the selector function for all components on every store change.
- **Tree Shakable.** The chunk contains only stores used by components
  in the chunk.
- Was designed to move logic from components to stores.
- It has good **TypeScript** support.

```tsx
import { useStore } from '@octanejs/nanostores'
import { $profile } from '../stores/profile.js'

export function Header() @{
  const profile = useStore($profile)
  <header>{'Hi, ' + profile.name}</header>
}
```

[Octane]: https://github.com/octanejs/octane
[Nano Stores]: https://github.com/nanostores/nanostores/

---

<img src="https://cdn.evilmartians.com/badges/logo-no-label.svg" alt="" width="22" height="16" />  Nano Stores Octane is built by <b><a href="https://evilmartians.com/">Evil Martians</a></b>, an American design and engineering consultancy for <b>developer tools, AI, and cybersecurity startups</b>.

---

## Options

### Keys

Use the `keys` option to re-render only on specific key changes:

```tsx
export function Header() @{
  const profile = useStore($profile, { keys: ['name'] })
  <header>{profile.name as string}</header>
}
```

Listening to a base key will automatically trigger a re-render
if any of its nested properties mutate.

```tsx
// Will listen for all changes in profile object
const profile = useStore($profile, { keys: ['profile'] })
```

### SSR

SSR could be very complicated. To avoid hydration errors you
need exactly the same stores state in the end of server HTML rendering
and during the first DOM render on the client.

For simple solution you can disable any store update on the server
by `ssr: 'initial'`:

```tsx
export function Header() @{
  const profile = useStore($profile, { ssr: 'initial' })
  // Hydrate with initial profile, then render latest client-side value
  <header>{profile.name as string}</header>
}
```

For advanced cases where you update store values on the server before SSR, and need pages to hydrate with the updated value from the server, set a function that returns the server state: `ssr: () => serverState`.

```tsx
// Value of store on server at time of SSR, passed to client somehow...
const profileFromServer = { name: 'A User' }

export function Header() @{
  const profile = useStore($profile, {
    ssr:
      typeof window === 'undefined'
        ? // On server, always use up-to-date store value (no SSR handling)
          false
        : // On client, set server value to avoid error on hydration
          () => profileFromServer
  })
  // Hydrate with profile at time of SSR, then render latest client-side value
  <header>{profile.name as string}</header>
}
```

A function set on `ssr` is provided to octane's `useSyncExternalStore`
as the `getServerSnapshot` option. Server rendering uses octane's
`octane/server` renderers (`renderToString`, `prerender`, or the
streaming renderers) with components compiled in server mode.
