# @octanejs/valtio

[Valtio](https://github.com/pmndrs/valtio) for the
[Octane](https://github.com/octanejs/octane) UI framework.

## Installation

```sh
npm install @octanejs/valtio
pnpm add @octanejs/valtio
```

The package reuses Valtio's framework-independent `valtio/vanilla` core and
reimplements only `useSnapshot` with Octane hooks. Existing Valtio components
can usually migrate by changing the import:

```tsx
import { proxy, useSnapshot } from '@octanejs/valtio';

const state = proxy({ count: 0 });

function Counter() @{
  const snap = useSnapshot(state);
  <button onClick={() => state.count++}>{snap.count as string}</button>
}
```

## Entry points

| import | what you get |
| --- | --- |
| `@octanejs/valtio` | Valtio's vanilla API plus the Octane-bound `useSnapshot` |
| `@octanejs/valtio/react` | the Octane-bound `useSnapshot` |
| `@octanejs/valtio/react/utils` | `useProxy`, for one proxy reference in renders and callbacks |
| `@octanejs/valtio/vanilla` | `proxy`, `snapshot`, `subscribe`, `ref`, and vanilla types |
| `@octanejs/valtio/vanilla/utils` | `subscribeKey`, `watch`, `devtools`, proxy collections, and other vanilla utilities |

`useSnapshot` retains Valtio's property-access tracking through `proxy-compare`.
Read from the returned snapshot and mutate the source proxy. The optional
`{ sync: true }` subscription mode is supported.

Current scope and verification status are tracked in
[`status.json`](./status.json).
