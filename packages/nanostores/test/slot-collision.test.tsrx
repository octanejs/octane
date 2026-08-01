// Empirical check for the "hook slots collide without parent" report.
//
// The report claims that when useStore is composed through a plain .ts wrapper
// that does NOT forward a distinct slot, subSlot returns undefined, so
// useRef/useCallback/useSyncExternalStore all collapse onto one ambient hook
// identity and corrupt subscription state when two stores are used in one
// component. This fixture mounts exactly that scenario: `useTwo` is a plain .ts
// custom hook that calls useStore twice WITHOUT threading any slot whatever,
// and a single .tsrx component consumes both stores. If the reported collision
// were real, the second store's subscription (or snapshotRef) would alias the
// first and the two rendered values would diverge from the live store state on
// update. They must stay independent.
import { act, cleanup, render, screen } from '@octanejs/testing-library'
import { atom } from 'nanostores'
import { equal } from 'node:assert'
import { afterEach, test } from 'vitest'

import { useStore } from '../index.ts'

// A plain .ts custom hook: intentionally does NOT accept or forward a slot.
// The compiler still wraps ITS call site in withSlot (because the caller is a
// compiled .tsrx component), so useStore's body runs with a non-empty path
// stack even though this wrapper passes nothing. This is the exact shape the
// report says breaks.
function useTwo<S1, S2>(s1: S1, s2: S2): [v1: S1 extends { get: () => infer V1 } ? V1 : never, v2: S2 extends { get: () => infer V2 } ? V2 : never] {
  const v1 = useStore(s1 as any)
  const v2 = useStore(s2 as any)
  return [v1, v2] as any
}

function TwoStores(props: {
  a: ReturnType<typeof atom<string>>
  b: ReturnType<typeof atom<number>>
}) @{
  const [va, vb] = useTwo(props.a, props.b)
  <div data-testid="dual">{va as string}:{vb as string}</div>
}

afterEach(() => {
  cleanup()
  window.document.body.innerHTML = ''
})

test('plain .ts wrapper forwarding no slot keeps two stores independent', async () => {
  const a = atom('a0')
  const b = atom(0)

  render(TwoStores as any, { props: { a, b } })
  equal(screen.getByTestId('dual').textContent, 'a0:0')

  // If the two useStore chains shared one hook identity, updating only `a`
  // would either not re-render, or `b`'s rendered value would be wrong after
  // the swap. Both must reflect their own live store.
  await act(async () => {
    a.set('a1')
    b.set(1)
  })
  equal(screen.getByTestId('dual').textContent, 'a1:1')

  // Update only `a`; `b` must stay put — a collision would drift it to `a`.
  await act(async () => {
    a.set('a2')
  })
  equal(screen.getByTestId('dual').textContent, 'a2:1')

  // Update only `b`; `a` must stay put.
  await act(async () => {
    b.set(2)
  })
  equal(screen.getByTestId('dual').textContent, 'a2:2')
})
