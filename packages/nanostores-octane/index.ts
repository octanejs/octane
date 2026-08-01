// Octane integration for Nano Stores — a port of @nanostores/react onto the
// octane renderer.
//
// The framework-agnostic core (`nanostores` itself: atom, map, computed,
// listenKeys, …) is reused UNCHANGED — it has zero react imports and runs on
// octane as-is. Only the thin React binding layer (`useStore`, built on
// useSyncExternalStore + useRef + useCallback) is reimplemented here against
// octane's identically named hooks, so the public API matches 1:1.
//
// The one octane-specific detail is hook slots: octane keys hooks by a
// compiler-injected per-call-site Symbol, appended as the LAST argument of
// every `use*` call. This file is a plain `.ts` module — the octane compiler
// does not inject slots into it — so `useStore` accepts the caller's slot as
// its trailing argument and derives stable child slots (one per internal hook
// call) via `subSlot`. Because the slot is per call site, `useStore(a)` and
// `useStore(b)` in one component stay independent, just like in React.
import type { Store, StoreValue } from 'nanostores'
import { listenKeys } from 'nanostores'
import { useCallback, useRef, useSyncExternalStore } from 'octane'

// Derives a stable child slot for one hook call inside a slotless (plain `.ts`)
// custom hook. Follows the convention used by the official @octanejs bindings:
// when the component's call site supplies a slot, each internal hook call gets
// a deterministic `<slot>:<tag>` Symbol; without a slot we pass undefined and
// let the hook fall back to its default identity.
export function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
  return slot !== undefined
    ? Symbol.for((slot.description ?? '') + ':' + tag)
    : undefined
}

type StoreKeys<T> = T extends { setKey: (k: infer K, v: any) => unknown }
  ? K
  : never

export interface UseStoreOptions<SomeStore> {
  /**
   * Re-render only when dependencies change.
   *
   * @default
   * ```ts
   * [store, options.keys]
   * ```
   */
  deps?: any[]

  /**
   * Will re-render components only on specific key changes.
   */
  keys?: StoreKeys<SomeStore>[]

  /**
   * Enable SSR support. Set `initial` when store's initial value is the same on
   * server and client, or provide a function to return the server store state
   * for advanced cases (per useSyncExternalStore's getServerSnapshot).
   */
  ssr?: (() => StoreValue<SomeStore>) | 'initial' | false
}

let emit =
  <Value>(snapshotRef: { current: Value }, onChange: () => void) =>
  (value: Value): void => {
    if (snapshotRef.current === value) return
    snapshotRef.current = value
    onChange()
  }

// The `keys` option only makes sense for stores with `setKey` (maps), which is
// what StoreKeys encodes in the public types; the runtime store is still typed
// as the wider `Store` union here.
type StoreWithKeys = Parameters<typeof listenKeys>[0]

/**
 * Subscribe to store changes and get store’s value.
 *
 * ```tsx
 * import { useStore } from '@octanejs/nanostores'
 *
 * import { router } from '../store/router'
 *
 * export function Layout() @{
 *   let page = useStore(router)
 *   @if (page.route === 'home') {
 *     <HomePage />
 *   } @else {
 *     <Error404 />
 *   }
 * }
 * ```
 *
 * @param store Store instance.
 * @param options Subscription options (keys filtering, deps, SSR snapshot).
 * @param slot Compiler-injected call-site slot — never pass it by hand.
 * @returns Store value.
 */
export function useStore<SomeStore extends Store>(
  store: SomeStore,
  options?: UseStoreOptions<SomeStore>,
  slot?: symbol
): StoreValue<SomeStore> {
  // The octane compiler appends a per-call-site Symbol slot as the LAST
  // argument of every `use*` call, so a call that omits `options` reaches us
  // as `useStore(store, sym)`. With `options` declared before `slot`, the
  // slot lands in `options`; a Symbol is truthy, so `options ?? {}` keeps it,
  // and `slot` stays `undefined`. `subSlot(undefined, …)` then returns
  // `undefined` for every inner base hook, so `useRef` and `useCallback`
  // both fall back to the caller's `withSlot` symbol and collide on one hook
  // slot. Strip the compiler slot before destructuring — exactly how octane's
  // own base hooks handle an optional leading param ahead of a trailing slot
  // (e.g. `useReducer(reducer, initialArg, initOrSlot, slot)`). A Symbol is
  // never a valid `UseStoreOptions` value, so `typeof options === "symbol"` is
  // the unambiguous discriminator octane uses throughout its runtime.
  if (typeof options === "symbol") {
    slot = options
    options = undefined
  }

  let { keys, deps = [store, keys], ssr } = options ?? {}

  let snapshotRef = useRef<StoreValue<SomeStore>>(store.get(), subSlot(slot, 'ref'))
  snapshotRef.current = store.get()

  let subscribe = useCallback(
    (onChange: () => void) => {
      emit(snapshotRef, onChange)(store.value)

      if (keys !== undefined && keys.length > 0) {
        // Keep runtime parity with upstream: a non-map store passed with
        // `keys` fails inside nanostores exactly as it always has (see the
        // index.ts override in oxlint.config.ts for the assertion)
        return listenKeys(store as StoreWithKeys, keys, emit(snapshotRef, onChange))
      }
      return store.listen(emit(snapshotRef, onChange))
    },
    deps,
    subSlot(slot, 'subscribe')
  )

  let get = (): StoreValue<SomeStore> => snapshotRef.current

  let server: () => StoreValue<SomeStore> = get
  if (ssr && 'init' in store) {
    server =
      ssr === 'initial'
        ? () => (store as unknown as { init: StoreValue<SomeStore> }).init
        : ssr
  }

  return useSyncExternalStore(subscribe, get, server, subSlot(slot, 'external-store'))
}
