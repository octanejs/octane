// The keystone adapter. Everything reactive in the router funnels through
// `@tanstack/react-store`'s `useStore(atom, selector)`, which is
// `useSyncExternalStoreWithSelector(atom.subscribe→unsubscribe, atom.get, …,
// selector, compare)`. Octane has no `…WithSelector`, so we fold the selector +
// compare into a memoized snapshot getter on top of octane's native
// `useSyncExternalStore`. The atoms come from router-core's client store factory
// (`createAtom` from `@tanstack/store`): `.subscribe(cb) → { unsubscribe }` + `.get()`.
import { useCallback, useRef, useSyncExternalStore } from 'octane'
import { splitSlot, subSlot } from './internal'

interface Atom<T> {
  subscribe: (cb: () => void) => { unsubscribe: () => void }
  get: () => T
}

// Public signature mirrors @tanstack/react-store's `useStore(store, selector,
// compare)`; the store parameter is the structural `{ get }` shape so router-core's
// `RouterReadableStore`/`RouterWritableStore` atoms (whose types omit `subscribe`)
// infer `T` directly. The trailing `slot` is the binding's forwarded call-site slot
// (see internal.ts) — the implementation splits it off the raw argument list.
export function useStore<T, TSelected = T>(
  atom: { get: () => T },
  selector?: (state: T) => TSelected,
  compare?: (a: TSelected, b: TSelected) => boolean,
  slot?: symbol,
): TSelected
export function useStore<T, TSelected = T>(...args: Array<any>): TSelected {
  const [user, slot] = splitSlot(args)
  const atom = user[0] as Atom<T>
  const selector = (user[1] ?? ((s: T) => s as unknown as TSelected)) as (
    s: T,
  ) => TSelected
  const compare = (user[2] ?? Object.is) as (
    a: TSelected,
    b: TSelected,
  ) => boolean

  // Re-subscribe only when the atom identity changes (it's stable across renders).
  const subscribe = useCallback(
    (onChange: () => void) => atom.subscribe(onChange).unsubscribe,
    [atom],
    subSlot(slot, 'us:cb'),
  )

  // Memoize selector output: same store input → same output; structurally-equal
  // output keeps its previous reference (so useSyncExternalStore doesn't loop).
  const cache = useRef<{ in: T; out: TSelected } | null>(
    null,
    subSlot(slot, 'us:cache'),
  )
  const getSnapshot = (): TSelected => {
    const input = atom.get()
    const prev = cache.current
    if (prev && Object.is(prev.in, input)) {
      return prev.out
    }
    const next = selector(input)
    if (prev && compare(prev.out, next)) {
      cache.current = { in: input, out: prev.out }
      return prev.out
    }
    cache.current = { in: input, out: next }
    return next
  }

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
    subSlot(slot, 'us:uses'),
  )
}
