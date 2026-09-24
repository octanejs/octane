# @octanejs/base-ui-utils

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
