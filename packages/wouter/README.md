# @octanejs/wouter

An Octane port of [`wouter`](https://github.com/molefrog/wouter), pinned to
`wouter@3.10.0`.

## Installation

```sh
npm install @octanejs/wouter
pnpm add @octanejs/wouter
```

```tsrx
import { Link, Route, Router } from "@octanejs/wouter";
import { memoryLocation } from "@octanejs/wouter/memory-location";

const memory = memoryLocation({ path: "/" });

export function App() @{
  <Router hook={memory.hook}>
    <nav>
      <Link href="/">Home</Link>
      <Link href="/about">About</Link>
    </nav>
    <Route path="/about">About Octane</Route>
  </Router>
}
```

The main entry exports `Router`, `Route`, `Link`, `Switch`, `Redirect`,
`useRouter`, `useLocation`, `useSearch`, `useSearchParams`, `useRoute`,
`useParams`, and `matchRoute`. Browser, hash, and memory location hooks are
available from the matching upstream-compatible subpaths.

Octane refs are props, so `Link` accepts `ref` directly. `Switch` inspects
element descriptors; pass explicit descriptor arrays (for example with
`createElement`) when its children are assembled dynamically. Nested TSRX
children are opaque render blocks and cannot be inspected by `Switch`.

See [`UPSTREAM.md`](./UPSTREAM.md) for the source pin, export crosswalk, adapted
test disposition, and explicit platform gaps.
