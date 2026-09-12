# @octanejs/jotai

Jotai 3 atoms and stores for Octane. The package imports Jotai's vanilla core and ports its React hooks and provider to Octane.

## Installation

```sh
npm install @octanejs/jotai
pnpm add @octanejs/jotai
```

```tsx
import { atom, useAtom } from '@octanejs/jotai';

const countAtom = atom(0);

function Counter() @{
  const [count, setCount] = useAtom(countAtom);
  <button onClick={() => setCount((value) => value + 1)}>{count as string}</button>
}
```

## Entry points

| Import | Surface |
| --- | --- |
| `@octanejs/jotai` | Vanilla atoms/stores, `Provider`, `useStore`, `useAtom`, `useSetAtom`, `useAtomValue`, `useAtomValueRaw`, `useAtomValueRawSync` |
| `@octanejs/jotai/react` | Provider and hooks |
| `@octanejs/jotai/react/utils` | `useResetAtom`, `useReducerAtom`, `useAtomCallback`, `useHydrateAtoms` |
| `@octanejs/jotai/vanilla` | Direct re-exports of `jotai/vanilla` |
| `@octanejs/jotai/vanilla/utils` | Direct re-exports of `jotai/vanilla/utils` |
| `@octanejs/jotai/vanilla/internals` | Upstream's unstable store building blocks |
| `@octanejs/jotai/utils` | Vanilla utilities and hook utilities |

Framework-neutral callers can import directly from `jotai/vanilla` and `jotai/vanilla/utils`. These imports share the same atoms and stores with the Octane binding.

## Jotai 3 migration

- `useAtomValueRaw` returns the atom value without unwrapping promises or suspending. It subscribes through an effect.
- `useAtomValueRawSync` also returns the raw value and uses `useSyncExternalStore` for synchronous store consistency.
- `useAtomValue` and `useAtom` retain Suspense integration. Their obsolete `delay` option is removed.
- `loadable` is removed. Use the retained `unwrap` utility or read raw promise values for non-suspending reads.
- `atomFamily` moves to `jotai-family`; install that package and import `atomFamily` directly from it.
- The atom read function's `setSelf` option is removed. Its replacement depends on the use case; see the [upstream migration guide](https://github.com/pmndrs/jotai/blob/89d4fddd1949628e50952fc8ac1b09786248dfca/docs/guides/migrating-to-v3.mdx).
- Upstream's internal store API advances from Rev3 to Rev4. It remains unstable.
- The existing `INTERNAL_InferAtomTuples` type remains available from both utility entry points for compatibility.

Readers no longer force a second render immediately after subscribing. `useSetAtom` still does not subscribe the writer. Hook slots are forwarded to keep multiple atom hooks in one component independent.

## Async atoms and server rendering

`useAtomValue` unwraps Jotai's stable continuable promises through Octane's `use()`. Use a Suspense boundary for pending values. Both raw hooks preserve the promise as a value.

Create a store per server request and pass it to `Provider`. Server rendering does not mount atom subscriptions. The hydration conformance test checks reuse of the server DOM, live client updates, and subscription teardown.

See [UPSTREAM.md](./UPSTREAM.md) for the immutable source pin, API crosswalk, test adaptation, and recorded evidence.
