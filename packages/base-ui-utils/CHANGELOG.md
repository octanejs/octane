# @octanejs/base-ui-utils

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
