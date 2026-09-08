# Migrating to the Base UI 1.8 binding

This binding targets `@base-ui/react` 1.8.0 and `@base-ui/utils` 0.4.0 through the companion `@octanejs/base-ui-utils` package. Upstream 1.8 parity does not by itself preserve the previously published Octane binding surface.

## Required Octane versions

`@octanejs/base-ui`, `@octanejs/base-ui-utils`, `@octanejs/shadcn`, and `@octanejs/testing-library` now peer on **Octane `^0.2.5`**.

Published Octane **0.2.4 and earlier** is not enough:

- `@octanejs/testing-library` statically imports `isInActScope`, which 0.2.4 does not export.
- The Base UI 1.8 source needs the compiler and runtime from this release (method and transitive hook compilation, typed namespaces, act batching, layout cascades, fragment portals, and resolved Suspense hydration).

Upgrade Octane in the same release as these bindings. Other `@octanejs/*` packages still accept `^0.1.51 || ^0.2.0` unless they pull in the packages above.

## Newly added APIs

- Select, Combobox, Autocomplete, Drawer, Navigation Menu, OTP Field, Scroll Area, Toolbar
- Temporal adapters (`date-fns` and `luxon` remain optional peers)
- `@octanejs/base-ui-utils` public utility entries, including the public store entry
- Octane `isInActScope` for testing helpers

## Replaced implementations

- Existing primitives are now upstream-shaped authored source with compiler-assigned hook slots, not the previous flat/manual-slot port
- The package export map is an explicit entry list instead of a wildcard
- Publication is authored Octane source only; the consuming application compiles it

## Removed APIs and entry points

- Precompiled CommonJS export conditions
- The previous `./*` wildcard export map. Import only documented public subpaths
- Previously exposed private Utils implementation paths. Import store utilities, including `StoreInspector`, from the public store entry

## Compatibility retained from the previous Octane binding

These remain supported even though upstream 1.8 no longer documents them on the root barrel:

```ts
import { useMediaQuery } from '@octanejs/base-ui';

const wide = useMediaQuery('(min-width: 600px)');
```

`useMediaQuery(query)` still accepts an omitted options argument. The hook also remains at `@octanejs/base-ui/unstable-use-media-query`.

Named component aliases for Accordion, Collapsible, and Tabs, popup handle constructors and factories, toast manager helpers, and the Tabs value/orientation/activation-direction types remain available from their previous root and component subpaths.
