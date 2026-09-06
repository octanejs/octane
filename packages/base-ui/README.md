# @octanejs/base-ui

[Base UI](https://base-ui.com) (`@base-ui/react`) ported to the
[octane](https://github.com/octanejs/octane) UI framework — headless, accessible, unstyled
UI primitives.

## Installation

```sh
npm install @octanejs/base-ui
pnpm add @octanejs/base-ui
```

This binding targets Base UI **1.8.0**. The complete export surface is implemented,
including Select, Combobox, Autocomplete, Drawer, Navigation Menu, OTP Field,
Scroll Area, and Toolbar. Pristine and native unit, browser, type, and hydration checks pass;
see [UPSTREAM.md](./UPSTREAM.md) for the pinned source and evidence.

Use it in an Octane application with the Octane compiler enabled. ES module
exports ship authored source so the application compiler selects client or server
output. Compile these source entries with the consuming application’s Octane toolchain.

## API

Mirrors Base UI's deep-subpath imports:

```ts
import { Separator } from '@octanejs/base-ui/separator';
import { useRender } from '@octanejs/base-ui/use-render';
import { mergeProps } from '@octanejs/base-ui/merge-props';
import { Select } from '@octanejs/base-ui/select';
import { Combobox } from '@octanejs/base-ui/combobox';
```

Rendered component parts support Base UI's composition props — `render` (a JSX element or
`(props, state) => element`), `className` (string or `(state) => string`), and `style`
(object or `(state) => object`) — routed through `useRenderElement`.
CSS text strings are not accepted by Base UI's style composition API.

The optional temporal adapters require their matching peer packages:

```sh
npm install date-fns @date-fns/tz # Date-fns adapter
npm install luxon               # Luxon adapter
```

TypeScript users of the Luxon adapter also need `@types/luxon`.

## Development checks

From the repository root:

```sh
pnpm --dir packages/base-ui test          # Native, differential and SSR tests
pnpm --dir packages/base-ui test:upstream # Adapted upstream suite in jsdom
pnpm --dir packages/base-ui test:browser  # Adapted upstream suite in Chromium
pnpm --dir packages/base-ui test:pristine # Immutable React oracle in jsdom
pnpm --dir packages/base-ui upstream:verify
```

## Migrating from the Base UI 1.6 binding

Upgrade `octane` to **0.2.5 or later in the 0.2 line** together with this binding,
`@octanejs/base-ui-utils`, `@octanejs/testing-library`, and `@octanejs/shadcn` when
used. These packages require the compiler, hydration, and `act` support released
in that coordinated patch. Earlier Octane 0.1 and 0.2 releases are not supported.

- Select, Combobox, Autocomplete, Drawer, Navigation Menu, OTP Field, Scroll Area,
  Toolbar, temporal adapters, and the remaining upstream parts are now available.
- Existing primitives use the Base UI 1.8 implementations and public props. Keep
  using component namespaces such as `Accordion.Root` and `Dialog.createHandle`.
  Previously exported named components, handle constructors/factories, Toast
  manager helpers, and Tabs type aliases remain available at the root and their
  component entries. `useMediaQuery(query)` still works from the root or
  `/unstable-use-media-query`; its options remain optional.
- Packages publish authored Octane source. Use the Octane compiler integration
  in your consumer toolchain; precompiled CommonJS export conditions are no
  longer provided.
- The export map now lists the upstream public entries explicitly. The previous
  `/internal` and wildcard `/utils/*` implementation paths are unavailable.
  Import supported utilities from `@octanejs/base-ui-utils`, for example
  `@octanejs/base-ui-utils/usePreviousValue`, and composite primitives from
  `@octanejs/base-ui/internals/composite`. Other private implementation paths
  have no supported replacement contract.

## Intentional divergences from Base UI (React)

- **Native events, not synthetic.** Handlers receive native DOM events (octane delegates
  natively). `event.preventBaseUIHandler()` still works — the shim is attached to the
  native event.
- **ref-as-prop.** No `forwardRef`; `ref` is a normal prop (React-19 shape).
- **`className` composition** follows octane's `normalizeClass` at the apply site; the
  `render`-prop merge concatenates strings exactly like Base UI.
- Octane does not replay mount effects in Strict Mode or implement React's
  Server Components Flight format.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
