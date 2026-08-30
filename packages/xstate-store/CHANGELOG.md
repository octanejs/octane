# @octanejs/xstate-store

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

- 106070e: Add `@octanejs/xstate-store`, a port of `@xstate/store-react@2.0.0`.

  `@xstate/store` is framework-neutral and is re-exported wholesale exactly as
  upstream does, so `createStore`, `createAtom`, `fromStore`, `shallowEqual`, and
  every type reach consumers from this entry point unchanged. Only the React
  binding module is ported: `useSelector` (both overloads), `useStore`, `useAtom`
  (all three overloads), `useAtomState`, and `createStoreHook`.

  The pinned release's own suite runs both ways. The `xstate-store-pristine` lane
  spawns the byte-exact vendored suite against `@xstate/store-react@2.0.0` and
  `react@19.2.3` (19 of 19 cases), and `xstate-store-adapted-upstream` reruns the
  same 14 runtime identities on Octane through a TSRX fixture, with every case
  name and assertion preserved. Both type suites run as well: the vendored one
  under plain `tsc` and a one-for-one adapted one under `tsrx-tsc`, with all
  thirteen `@ts-expect-error` markers intact.

  One divergence is attributable to this binding and is recorded in
  `audit/react-parity.json`. Upstream calls hooks inside `if` branches in
  `useSelector` and `useAtom`, which React tolerates only because the branch is
  stable per call site. Octane keys hooks by call site, so the branching shape is
  kept verbatim and is simply legal here: a call site that does flip keeps working
  and the abandoned branch's subscription is released, where React would corrupt
  hook order.

  Appending a slot parameter to upstream's conditional rest tuples would have
  destroyed generic inference for the hooks with no leading parameter, so
  `useStore` and `useAtomState` declare upstream's exact rest tuple as an overload
  and recover the slot at runtime. Authored code never passes one. Only the type
  lane caught this.

- 7535acd: Deduplicate binding hook sub-slot derivation behind Octane's shared helper while preserving each binding's slotless and symbol-identity behavior.
- Updated dependencies [9b06e47]
- Updated dependencies [7535acd]
  - octane@0.1.44
