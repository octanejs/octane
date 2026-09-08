# @tanstack/react-hotkeys

## 0.10.0

### Minor Changes

- feat: upgrade to latest tanstack store version ([`3104ee4`](https://github.com/TanStack/hotkeys/commit/3104ee494edd9877249c46b648af27d31cfd8c9c))

### Patch Changes

- Updated dependencies [[`3104ee4`](https://github.com/TanStack/hotkeys/commit/3104ee494edd9877249c46b648af27d31cfd8c9c)]:
  - @tanstack/hotkeys@0.8.0

## 0.9.1

### Patch Changes

- Updated dependencies [[`0e46137`](https://github.com/TanStack/hotkeys/commit/0e46137405aa2d05f2e0a03d5c675d87c7218aab)]:
  - @tanstack/hotkeys@0.7.1

## 0.9.0

### Minor Changes

- feat: options.meta with name and descriptions by default and new useHotkeysRegistrations hooks ([#95](https://github.com/TanStack/hotkeys/pull/95))

### Patch Changes

- Updated dependencies [[`63bfa22`](https://github.com/TanStack/hotkeys/commit/63bfa229b98427fd1f603095fb3435d66ceeda09)]:
  - @tanstack/hotkeys@0.7.0

## 0.8.4

### Patch Changes

- Updated dependencies [[`b04c88e`](https://github.com/TanStack/hotkeys/commit/b04c88ee0e07be3eef8dc2852868c0421efce26d)]:
  - @tanstack/hotkeys@0.6.4

## 0.8.3

### Patch Changes

- Updated dependencies [[`1999147`](https://github.com/TanStack/hotkeys/commit/1999147e6369896695975bf8042a2b178b15c366)]:
  - @tanstack/hotkeys@0.6.3

## 0.8.2

### Patch Changes

- Updated dependencies [[`6939ac7`](https://github.com/TanStack/hotkeys/commit/6939ac7f91ce8b5ffe54cdc122171f277c837c92)]:
  - @tanstack/hotkeys@0.6.2

## 0.8.1

### Patch Changes

- chore: upgrade tanstack store version ([`19a960f`](https://github.com/TanStack/hotkeys/commit/19a960fb07655db28b6ec967cba7f957ece66edb))

- Updated dependencies [[`19a960f`](https://github.com/TanStack/hotkeys/commit/19a960fb07655db28b6ec967cba7f957ece66edb)]:
  - @tanstack/hotkeys@0.6.1

## 0.8.0

### Minor Changes

- Refactor hotkey normalization and display formatting APIs in `@tanstack/hotkeys`, align framework packages and devtools, and update display-related constants. ([#85](https://github.com/TanStack/hotkeys/pull/85))

### Patch Changes

- Updated dependencies [[`74b474d`](https://github.com/TanStack/hotkeys/commit/74b474db6e44ad2d0a92f97898f5b145f00b9b93)]:
  - @tanstack/hotkeys@0.6.0

## 0.7.0

### Minor Changes

- Add plural sequence APIs (`useHotkeySequences`, `createHotkeySequences`, `createHotkeySequencesAttachment`, `injectHotkeySequences`) and align `enabled` across adapters: disabled registrations stay in the manager for devtools, only core dispatch is skipped, and toggling `enabled` updates handles via `setOptions` instead of churning unregister/register. ([#80](https://github.com/TanStack/hotkeys/pull/80))

## 0.6.0

### Minor Changes

- Align sequence recording with hotkey-prefixed public API: `HotkeySequenceRecorder`, framework hooks `useHotkeySequenceRecorder` / `createHotkeySequenceRecorder` / `injectHotkeySequenceRecorder`, and provider defaults under `hotkeySequenceRecorder`. ([#78](https://github.com/TanStack/hotkeys/pull/78))

### Patch Changes

- Updated dependencies [[`e04555e`](https://github.com/TanStack/hotkeys/commit/e04555e234bfed439f59c319cc9039a515770d72)]:
  - @tanstack/hotkeys@0.5.0

## 0.5.1

### Patch Changes

- fix: add jsdoc for combos in hotkey sequences ([`4e29eec`](https://github.com/TanStack/hotkeys/commit/4e29eec1eab57c7b2b59ccda84ce32dcb5f9fd8c))

- Updated dependencies [[`a3aa4f3`](https://github.com/TanStack/hotkeys/commit/a3aa4f351067303e792088590067879f639e5d30), [`4e29eec`](https://github.com/TanStack/hotkeys/commit/4e29eec1eab57c7b2b59ccda84ce32dcb5f9fd8c)]:
  - @tanstack/hotkeys@0.4.3

## 0.5.0

### Minor Changes

- feat: add `useHotkeys` hook for registering multiple hotkeys in one call ([#75](https://github.com/TanStack/hotkeys/pull/75))

## 0.4.2

### Patch Changes

- Updated dependencies [[`ac2248c`](https://github.com/TanStack/hotkeys/commit/ac2248c0f5a74db8784fc729861250d75d370db2)]:
  - @tanstack/hotkeys@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [[`eaf8b84`](https://github.com/TanStack/hotkeys/commit/eaf8b849d198576c7299d34574c6907581cebfb6)]:
  - @tanstack/hotkeys@0.4.1

## 0.4.0

### Minor Changes

- add angular adapter and upgrade packages ([#31](https://github.com/TanStack/hotkeys/pull/31))

### Patch Changes

- Updated dependencies [[`c173ed0`](https://github.com/TanStack/hotkeys/commit/c173ed079c6b0f282c9cf8dcb6d9523408eca5a0)]:
  - @tanstack/hotkeys@0.4.0

## 0.3.3

### Patch Changes

- Updated dependencies [[`029f473`](https://github.com/TanStack/hotkeys/commit/029f4733e5e7ed8739cf17125d327c626e4bb1d0)]:
  - @tanstack/hotkeys@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies [[`67decce`](https://github.com/TanStack/hotkeys/commit/67decced89ce5dc874c5559fefb46096e76e560b)]:
  - @tanstack/hotkeys@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [[`762cabf`](https://github.com/TanStack/hotkeys/commit/762cabfd6e765f6ced1efdacbbf296ead0a5a080)]:
  - @tanstack/hotkeys@0.3.1

## 0.3.0

### Minor Changes

- feat: overhaul sequence-manager and hooks to be in feature parity with hotkey-manager. ([#21](https://github.com/TanStack/hotkeys/pull/21))

### Patch Changes

- Updated dependencies [[`7328e36`](https://github.com/TanStack/hotkeys/commit/7328e360f0e99b5374fb97c07e0f2a500d8e5b9c)]:
  - @tanstack/hotkeys@0.3.0

## 0.2.0

### Minor Changes

- feat: upgrade tanstack store version ([#35](https://github.com/TanStack/hotkeys/pull/35))

### Patch Changes

- Updated dependencies [[`8ae6b64`](https://github.com/TanStack/hotkeys/commit/8ae6b64ef10b53186c367f594f81ecdec15071d7)]:
  - @tanstack/hotkeys@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`26a74d8`](https://github.com/TanStack/hotkeys/commit/26a74d8e3279766a5cddbc7e7f146af0557cfbb9)]:
  - @tanstack/hotkeys@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`54f550f`](https://github.com/TanStack/hotkeys/commit/54f550f1d2e47084ea11411d465780ede19fbdfa)]:
  - @tanstack/hotkeys@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`56d50ba`](https://github.com/TanStack/hotkeys/commit/56d50ba4595a7609b13a36376afdc46ba92fab29)]:
  - @tanstack/hotkeys@0.1.1

## 0.1.0

### Minor Changes

- feat: smarter ignoreInputs default ([#10](https://github.com/TanStack/hotkeys/pull/10))

### Patch Changes

- Updated dependencies [[`8d4ad42`](https://github.com/TanStack/hotkeys/commit/8d4ad423b9c6de4f406505b08e7547a9112ceb41)]:
  - @tanstack/hotkeys@0.1.0

## 0.0.3

### Patch Changes

- fix: rerun register when options.enabled is changed ([`3ada864`](https://github.com/TanStack/hotkeys/commit/3ada864e07d6a6fe46dd95162592b29e681f52d1))

## 0.0.2

### Patch Changes

- feat: initial release ([`341d167`](https://github.com/TanStack/hotkeys/commit/341d16731f09709a463343852ae4c0e1b6bc6613))

- Updated dependencies [[`341d167`](https://github.com/TanStack/hotkeys/commit/341d16731f09709a463343852ae4c0e1b6bc6613)]:
  - @tanstack/hotkeys@0.0.2

## 0.0.1

### Patch Changes

- feat: TanStack Hotkeys ([#5](https://github.com/TanStack/hotkeys/pull/5))

- Updated dependencies [[`e16b529`](https://github.com/TanStack/hotkeys/commit/e16b52983d4bf4ba249668591e8fc7133fcf8b85)]:
  - @tanstack/hotkeys@0.0.1
