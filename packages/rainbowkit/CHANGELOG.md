# @octanejs/rainbowkit

## 0.0.7

### Patch Changes

- Updated dependencies [46e1833]
- Updated dependencies [5a8e807]
  - octane@0.1.27
  - @octanejs/tanstack-query@0.1.26
  - @octanejs/wagmi@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [1f01b08]
- Updated dependencies [48e2397]
  - octane@0.1.26
  - @octanejs/tanstack-query@0.1.25
  - @octanejs/wagmi@0.0.6

## 0.0.5

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - octane@0.1.25
  - @octanejs/tanstack-query@0.1.24
  - @octanejs/wagmi@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies [ec77602]
- Updated dependencies [29c5bdb]
- Updated dependencies [9b032d8]
- Updated dependencies [f9b2731]
- Updated dependencies [6714914]
  - octane@0.1.24
  - @octanejs/tanstack-query@0.1.23
  - @octanejs/wagmi@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [c1ad31b]
  - octane@0.1.23
  - @octanejs/tanstack-query@0.1.22
  - @octanejs/wagmi@0.0.3

## 0.0.2

### Patch Changes

- 76a2041: Add an Octane-native RainbowKit 2.2.11 compatibility cohort over
  `@octanejs/wagmi` v3, including provider, connect controls, wallet button, modal
  hooks, accessible wallet/account/chain dialogs, and theme factories.
- 76a2041: Report unsupported networks from the connected wallet's live chain instead of the configured default chain.
- 671c88c: Key the two elements `WalletButton` returns, so rendering one no longer warns.

  `WalletButton` returns an array — the connect control, plus an error paragraph
  that appears only after a failed request. Octane reconciles an array return as
  a keyed list, so without keys it warned on render:

  ```
  Octane: each element in an array child should have a unique "key" prop
  ```

  and matched the two slots by position, which lets the button be reconciled
  against the error node when the error appears or clears — losing the control's
  DOM identity and its focus. The two slots are fixed roles, so the role name is
  their stable identity.

- Updated dependencies [43df1f9]
- Updated dependencies [7a112b4]
- Updated dependencies [cbd240d]
  - octane@0.1.22
  - @octanejs/wagmi@0.0.2
  - @octanejs/tanstack-query@0.1.21
