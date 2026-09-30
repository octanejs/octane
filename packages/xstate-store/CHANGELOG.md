# @octanejs/xstate-store

## 0.0.15

### Patch Changes

- Updated dependencies [55c2c01]
- Updated dependencies [38a5443]
- Updated dependencies [0547835]
- Updated dependencies [877a7a4]
- Updated dependencies [68c094d]
- Updated dependencies [c1a86ce]
- Updated dependencies [63baf8c]
- Updated dependencies [489db93]
- Updated dependencies [687f584]
- Updated dependencies [1b8c949]
- Updated dependencies [04df7e9]
- Updated dependencies [4c1ca88]
- Updated dependencies [489b121]
- Updated dependencies [ce47fae]
- Updated dependencies [b2e4b9a]
- Updated dependencies [8de664c]
- Updated dependencies [5cc6b64]
- Updated dependencies [0f8cb49]
- Updated dependencies [7fa3a2d]
- Updated dependencies [aa6753b]
- Updated dependencies [ce11f82]
- Updated dependencies [bd21050]
- Updated dependencies [5575ff6]
- Updated dependencies [5f14459]
- Updated dependencies [9230292]
- Updated dependencies [e4974cc]
- Updated dependencies [19f07e0]
- Updated dependencies [898820a]
- Updated dependencies [25cc659]
- Updated dependencies [8fb96a0]
- Updated dependencies [699e363]
- Updated dependencies [84d2eaf]
- Updated dependencies [ca7d55d]
- Updated dependencies [5bc3af7]
- Updated dependencies [94ba1b6]
- Updated dependencies [03e7ba0]
- Updated dependencies [ddb655c]
- Updated dependencies [4ebe8d4]
- Updated dependencies [e325a83]
- Updated dependencies [d78f279]
- Updated dependencies [ddb655c]
- Updated dependencies [8fb96a0]
- Updated dependencies [d7ffa13]
- Updated dependencies [32c1bf4]
- Updated dependencies [7ee5f1a]
- Updated dependencies [608ff43]
- Updated dependencies [09c58dc]
- Updated dependencies [28a3636]
- Updated dependencies [3f9b16b]
- Updated dependencies [25b6e6d]
- Updated dependencies [9d322ef]
- Updated dependencies [4d8a93b]
- Updated dependencies [d455cb1]
- Updated dependencies [40f4827]
- Updated dependencies [4180828]
- Updated dependencies [c587109]
- Updated dependencies [ba483f4]
- Updated dependencies [c37f922]
- Updated dependencies [007691e]
  - octane@0.7.0

## 0.0.14

### Patch Changes

- Updated dependencies [4b235d2]
- Updated dependencies [411c555]
- Updated dependencies [ac2a217]
- Updated dependencies [6e86908]
- Updated dependencies [b9b0bc4]
- Updated dependencies [c3dda51]
  - octane@0.6.0

## 0.0.13

### Patch Changes

- Updated dependencies [3390f40]
- Updated dependencies [d285bd7]
- Updated dependencies [701b8c3]
- Updated dependencies [4f25786]
- Updated dependencies [afc0bee]
- Updated dependencies [752d750]
- Updated dependencies [2d46905]
- Updated dependencies [a95c2dc]
- Updated dependencies [fd81578]
- Updated dependencies [bdd7db7]
- Updated dependencies [47580bd]
  - octane@0.5.0

## 0.0.12

### Patch Changes

- Updated dependencies [3a859dd]
- Updated dependencies [620769b]
- Updated dependencies [dbcabb2]
- Updated dependencies [92227f6]
- Updated dependencies [6580880]
- Updated dependencies [db35ac1]
- Updated dependencies [f209f7c]
- Updated dependencies [a2c3e07]
- Updated dependencies [a2c3e07]
- Updated dependencies [34e83ce]
  - octane@0.4.0

## 0.0.11

### Patch Changes

- a6d7f49: Remove the legacy `Context.Provider` alias from client, server, and native contexts. Provide values with `<Context value={value}>` or `createElement(Context, { value }, children)` instead. The compiler rejects statically recognized legacy Provider access with migration guidance, and Octane bindings now use contexts directly. Binding peer ranges accept Octane 0.3 alongside their previously supported runtime lines.

## 0.0.10

### Patch Changes

- ddaa8c5: Promote Octane to beta and begin the 0.2 release line.

## 0.0.9

### Patch Changes

- Updated dependencies [9321d39]
- Updated dependencies [fdb711a]
- Updated dependencies [5e80135]
- Updated dependencies [ad499d0]
- Updated dependencies [892da9a]
- Updated dependencies [babf8d7]
- Updated dependencies [2785a2f]
- Updated dependencies [df82fbc]
- Updated dependencies [0824502]
- Updated dependencies [47c8f54]
  - octane@0.1.51

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
