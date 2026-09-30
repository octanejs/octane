# @octanejs/base-ui-utils

## 0.1.6

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

## 0.1.5

### Patch Changes

- Updated dependencies [4b235d2]
- Updated dependencies [411c555]
- Updated dependencies [ac2a217]
- Updated dependencies [6e86908]
- Updated dependencies [b9b0bc4]
- Updated dependencies [c3dda51]
  - octane@0.6.0

## 0.1.4

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

## 0.1.3

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

## 0.1.2

### Patch Changes

- a6d7f49: Remove the legacy `Context.Provider` alias from client, server, and native contexts. Provide values with `<Context value={value}>` or `createElement(Context, { value }, children)` instead. The compiler rejects statically recognized legacy Provider access with migration guidance, and Octane bindings now use contexts directly. Binding peer ranges accept Octane 0.3 alongside their previously supported runtime lines.

## 0.1.1

### Patch Changes

- 1846318: Require Octane 0.2.5 or newer for testing-library and the Base UI 1.8 binding.
  Published 0.2.4 does not export `isInActScope`. Restore the root `useMediaQuery`
  export and keep its options argument optional.
- 1846318: Update the Base UI binding to 1.8.0 and its shared utilities to 0.4.0. Add the
  complete Select, Combobox, Autocomplete, Drawer, Navigation Menu, OTP Field,
  Scroll Area, and Toolbar APIs, and update existing component parts and behavior.
  Publish authored Octane source for the consuming application to compile, including all
  public utility and temporal-adapter subpaths.

  Align the utility export map with upstream's documented entries. Previously
  exposed private implementation subpaths are no longer public; import store
  utilities, including StoreInspector, from the public store entry.

  Base UI and Utils now expose authored source without precompiled CommonJS
  conditions, so client, server, and profiling output use the consumer toolchain.

  Retain the previous binding’s named component and handle exports, Toast manager
  helpers, Tabs type aliases, and optional media-query calls at both import paths.
