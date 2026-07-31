# @octanejs/rainbowkit

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
