# @octanejs/xstate

## 0.0.8

### Patch Changes

- Updated dependencies [157543f]
- Updated dependencies [4d13159]
- Updated dependencies [a944ff3]
- Updated dependencies [f9f0d23]
- Updated dependencies [edf2b9d]
- Updated dependencies [9779569]
- Updated dependencies [96c86fc]
  - octane@0.1.50

## 0.0.7

### Patch Changes

- Updated dependencies [8adc693]
- Updated dependencies [a51c8c6]
  - octane@0.1.49

## 0.0.6

### Patch Changes

- Updated dependencies [3ca30fc]
- Updated dependencies [efdc8cb]
- Updated dependencies [922df8c]
- Updated dependencies [8a8afd8]
- Updated dependencies [37a8ca1]
- Updated dependencies [c84edbb]
- Updated dependencies [d5175ca]
- Updated dependencies [4a4996e]
  - octane@0.1.48

## 0.0.5

### Patch Changes

- Updated dependencies [af0d999]
- Updated dependencies [c800a1f]
- Updated dependencies [c1bb057]
- Updated dependencies [97b9349]
- Updated dependencies [4393bea]
- Updated dependencies [7dfef16]
- Updated dependencies [7e62361]
- Updated dependencies [964783a]
- Updated dependencies [d3dbd78]
  - octane@0.1.47

## 0.0.4

### Patch Changes

- Updated dependencies [7e96f71]
- Updated dependencies [d7226ff]
  - octane@0.1.46

## 0.0.3

### Patch Changes

- Updated dependencies [5b1e6a3]
- Updated dependencies [31abee5]
- Updated dependencies [fd6ce69]
- Updated dependencies [5f7a457]
- Updated dependencies [5227d7b]
- Updated dependencies [6927595]
- Updated dependencies [f1a7802]
  - octane@0.1.45

## 0.0.2

### Patch Changes

- 106070e: Add `@octanejs/xstate`, a port of `@xstate/react@6.1.0`.

  `xstate` itself is framework-neutral and is consumed unmodified as a peer
  dependency; only the React binding is ported, module for module, with `src/`
  mirroring the upstream layout so the two trees read side by side. Every export
  of the pinned entry point is accounted for in `UPSTREAM.md`: `useActor`,
  `useActorRef`, `useSelector`, `useMachine`, `createActorContext`, and
  `shallowEqual`. Two of upstream's npm dependencies are React-specific and are
  replaced rather than consumed —
  `use-sync-external-store/shim/with-selector` keeps its exact memoization
  algorithm on Octane's native `useSyncExternalStore`, and
  `use-isomorphic-layout-effect` becomes a slot-forwarding helper.

  The pinned release's own suite is the parity oracle, run both ways. The
  `xstate-pristine` lane spawns the byte-exact vendored suite against
  `@xstate/react@6.1.0` and `react@19.2.3` (144 of 144 cases), and
  `xstate-adapted-upstream` reruns the same 75 case identities on Octane through
  TSRX fixtures. Both type suites run too: the vendored one under plain `tsc`, and
  a one-for-one adapted one under `tsrx-tsc`. A differential lane drives one
  fixture through this binding and through the real `@xstate/react`, asserting
  byte-identical `innerHTML` after every click with `xstate@5.32.5` shared by both
  sides, so any difference is attributable to the binding.

  Four divergences are recorded in `audit/react-parity.json`, each bound to the
  cases that pin it. Octane has no StrictMode double-invoke, so upstream's eight
  `suiteKey === 'strict'` counts collapse to their non-strict values; error
  boundaries are `@try`/`@catch` blocks rather than class components;
  `useSyncExternalStore` gates its commit-time sync on the value instead of
  re-reading `getSnapshot`, which is unreachable for actors that notify; and the
  server snapshot is optional and falls back to `getSnapshot` where React throws.

  `createActorContext` stays plain `.ts` on purpose: its returned hooks forward
  the caller's compiler-assigned slot, and a compiled `.tsrx` would append its own
  symbol after the forwarded one and collapse every consumer call site onto a
  single hook cell.

- 7535acd: Deduplicate binding hook sub-slot derivation behind Octane's shared helper while preserving each binding's slotless and symbol-identity behavior.
- Updated dependencies [9b06e47]
- Updated dependencies [7535acd]
  - octane@0.1.44
