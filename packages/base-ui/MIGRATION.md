# Migrating to the Base UI 1.8 binding

This binding targets `@base-ui/react` 1.8.0 and `@base-ui/utils` 0.4.0 through the companion `@octanejs/base-ui-utils` package. Upstream 1.8 parity does not by itself preserve the previously published Octane binding surface.

## Required Octane version

`@octanejs/base-ui`, `@octanejs/base-ui-utils`, `@octanejs/shadcn`, and `@octanejs/testing-library` peer on the current Octane minor line, like the other `@octanejs/*` packages; each package's `peerDependencies` names the range. Upgrade Octane in the same release as these bindings.

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
