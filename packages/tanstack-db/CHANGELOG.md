# @octanejs/tanstack-db

## 0.0.13

### Patch Changes

- Updated dependencies [157543f]
- Updated dependencies [4d13159]
- Updated dependencies [a944ff3]
- Updated dependencies [f9f0d23]
- Updated dependencies [edf2b9d]
- Updated dependencies [9779569]
- Updated dependencies [96c86fc]
  - octane@0.1.50

## 0.0.12

### Patch Changes

- Updated dependencies [8adc693]
- Updated dependencies [a51c8c6]
  - octane@0.1.49

## 0.0.11

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

## 0.0.10

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

## 0.0.9

### Patch Changes

- Updated dependencies [7e96f71]
- Updated dependencies [d7226ff]
  - octane@0.1.46

## 0.0.8

### Patch Changes

- Updated dependencies [5b1e6a3]
- Updated dependencies [31abee5]
- Updated dependencies [fd6ce69]
- Updated dependencies [5f7a457]
- Updated dependencies [5227d7b]
- Updated dependencies [6927595]
- Updated dependencies [f1a7802]
  - octane@0.1.45

## 0.0.7

### Patch Changes

- 7535acd: Deduplicate binding hook sub-slot derivation behind Octane's shared helper while preserving each binding's slotless and symbol-identity behavior.
- Updated dependencies [9b06e47]
- Updated dependencies [7535acd]
  - octane@0.1.44

## 0.0.6

### Patch Changes

- Updated dependencies [4b590bd]
- Updated dependencies [c0ff085]
- Updated dependencies [6a68a7d]
- Updated dependencies [6b97f85]
  - octane@0.1.43

## 0.0.5

### Patch Changes

- Updated dependencies [1581e1b]
- Updated dependencies [afa3722]
- Updated dependencies [231e248]
- Updated dependencies [2f9b301]
- Updated dependencies [939c64d]
  - octane@0.1.42

## 0.0.4

### Patch Changes

- Updated dependencies [489a886]
- Updated dependencies [922b2d4]
- Updated dependencies [814a3c1]
  - octane@0.1.41

## 0.0.3

### Patch Changes

- Updated dependencies [ff9b859]
- Updated dependencies [14b8b40]
- Updated dependencies [cc6e5ea]
  - octane@0.1.40

## 0.0.2

### Patch Changes

- 0fc84da: Add `@octanejs/tanstack-db`: Octane live-query bindings for `@tanstack/db`. Re-exports `@tanstack/db@0.7.0` unchanged and ports the React live-query surface of `@tanstack/react-db` (`useLiveQuery`, `useLiveInfiniteQuery`, `useLiveSuspenseQuery`, `useLiveQueryEffect`, `usePacedMutations`) onto Octane hooks. `useLiveQuery`/`useLiveSuspenseQuery` run on db's shared `createLiveQueryObserver` and `useLiveInfiniteQuery` on the coordinated `createLiveQueryWindowController`, so status-only changes are observed, infinite-query windows are coordinated across hooks, and a failed page load rolls back and surfaces an error. Suspense integrates via Octane's `use(thenable)`.

  Allow browser-only TypeScript consumers to compile the reachable Octane client runtime without installing Node ambient types, while preserving the literal development-mode guards used for bundler substitution.

- Updated dependencies [954028b]
- Updated dependencies [21f4dfb]
- Updated dependencies [1cb4a19]
- Updated dependencies [0fc84da]
  - octane@0.1.39

## 0.0.1

Initial release of the Octane framework adapter for TanStack DB.
