# @octanejs/shadcn

shadcn/ui for the [octane](https://github.com/octanejs/octane) renderer, with
Base UI, Radix, and React Aria bases adapted to octane's hooks and native events.

## Installation

```sh
npm install @octanejs/shadcn
pnpm add @octanejs/shadcn
```

Upstream pin: `shadcn-ui/ui@4baadbc6` + CLI `shadcn@4.14.1`.

## What ships

- **44 component families across three bases**: the full Tier-1 static set, all 24
  radix-backed Tier-2 components, and the first Tier-3 composites (Sidebar with
  `useSidebar`/`useIsMobile`, Field), plus `cn()` and the default neutral theme
  tokens (`@octanejs/shadcn/theme.css`).
- **Two consumption modes**: import from the package subpaths, or install
  components AS SOURCE with the upstream shadcn CLI against the generated
  registry (`registry/` — `pnpm registry:build` / `registry:check`).
- **Three primitive bases in one registry**, selected the way shadcn selects its
  own: `components.json`'s `style` field, substituted into the registry URL. See
  [Installing with the shadcn CLI](#installing-with-the-shadcn-cli).
- **Styling flavors**: components are migrating to the default-Tailwind
  (utilities-inlined) flavor — class strings work against any Tailwind v4 build
  with the shadcn theme tokens. The not-yet-migrated families still carry the
  upstream `cn-*` semantic hooks and need a shadcn style sheet (e.g.
  `style-nova`). `status.json` lists exactly which families are which.

## Component coverage

The coverage table tracks the families ported for each primitive base.
Switching `style` changes which primitive a component is built on — the `data-slot` contract and
component names stay identical.

The Base UI wrappers target `@octanejs/base-ui`'s Base UI 1.8.0 API. Select,
Combobox, Navigation Menu, and Scroll Area primitives are available from
`@octanejs/base-ui`; their shadcn Base UI wrappers have not been ported yet.

<!-- BEGIN COVERAGE -->

**44 families** — Radix 44/44 · React Aria 33/44 · Base UI 40/44

✅ ported · — not ported yet (fair game) · ⛔ blocked, see notes below

| Family | Radix | React Aria | Base UI |
| --- | :---: | :---: | :---: |
| `accordion` | ✅ | ✅ | ✅ |
| `alert` | ✅ | ✅ | ✅ |
| `alert-dialog` | ✅ | ✅ | ✅ |
| `aspect-ratio` | ✅ | ✅ | ✅ |
| `avatar` | ✅ | ✅ | ✅ |
| `badge` | ✅ | ✅ | ✅ |
| `breadcrumb` | ✅ | ✅ | ✅ |
| `button` | ✅ | ✅ | ✅ |
| `card` | ✅ | ✅ | ✅ |
| `checkbox` | ✅ | ✅ | ✅ |
| `collapsible` | ✅ | ✅ | ✅ |
| `context-menu` | ✅ | ⛔ | ✅ |
| `dialog` | ✅ | ✅ | ✅ |
| `dropdown-menu` | ✅ | ⛔ | ✅ |
| `empty` | ✅ | ✅ | ✅ |
| `field` | ✅ | ✅ | ✅ |
| `hover-card` | ✅ | ⛔ | ✅ |
| `input` | ✅ | ✅ | ✅ |
| `item` | ✅ | ✅ | ✅ |
| `kbd` | ✅ | ✅ | ✅ |
| `label` | ✅ | ✅ | ✅ |
| `menubar` | ✅ | ⛔ | ✅ |
| `native-select` | ✅ | ✅ | ✅ |
| `navigation-menu` | ✅ | ⛔ | — |
| `pagination` | ✅ | ✅ | ✅ |
| `popover` | ✅ | ✅ | ✅ |
| `progress` | ✅ | ⛔ | ✅ |
| `radio-group` | ✅ | ✅ | ✅ |
| `scroll-area` | ✅ | ✅ | — |
| `select` | ✅ | ⛔ | — |
| `separator` | ✅ | ✅ | ✅ |
| `sheet` | ✅ | ✅ | ✅ |
| `sidebar` | ✅ | ⛔ | ✅ |
| `skeleton` | ✅ | ✅ | ✅ |
| `slider` | ✅ | ✅ | ✅ |
| `sonner` | ✅ | ⛔ | ⛔ |
| `spinner` | ✅ | ✅ | ✅ |
| `switch` | ✅ | ✅ | ✅ |
| `table` | ✅ | ✅ | ✅ |
| `tabs` | ✅ | ✅ | ✅ |
| `textarea` | ✅ | ✅ | ✅ |
| `toggle` | ✅ | ✅ | ✅ |
| `toggle-group` | ✅ | ⛔ | ✅ |
| `tooltip` | ✅ | ⛔ | ✅ |

**Blocked**

| Base | Family | Reason |
| --- | --- | --- |
| Base UI | `sonner` | needs next-themes, which has no octane binding |
| React Aria | `context-menu` | no counterpart in upstream’s aria base |
| React Aria | `dropdown-menu` | no counterpart in upstream’s aria base |
| React Aria | `hover-card` | no counterpart in upstream’s aria base |
| React Aria | `menubar` | no counterpart in upstream’s aria base |
| React Aria | `navigation-menu` | no counterpart in upstream’s aria base |
| React Aria | `progress` | no counterpart in upstream’s aria base |
| React Aria | `select` | needs input-group |
| React Aria | `sidebar` | no counterpart in upstream’s aria base |
| React Aria | `sonner` | needs next-themes, which has no octane binding |
| React Aria | `toggle-group` | no counterpart in upstream’s aria base |
| React Aria | `tooltip` | no counterpart in upstream’s aria base |

<!-- END COVERAGE -->

The table is generated from the sources by `pnpm coverage:build` and gated by `coverage:check`,
so it cannot drift as families land.

## Installing with the shadcn CLI

The registry is consumed by the **upstream** `shadcn` CLI — nothing octane-specific is
required on the consumer side.

Add the registry to your `components.json` and pick a base with `style`:

```jsonc
{
  "style": "base-nova", // base-nova | radix-nova | aria-nova
  "registries": {
    "@octane": "https://octanejs.dev/r/styles/{style}/{name}.json"
  }
}
```

```bash
npx shadcn add @octane/button
```

`{style}` and `{name}` are the only placeholders the CLI substitutes, and it never parses the
style string — so the base is chosen entirely by which tree the registry serves. This is the
same mechanism shadcn uses upstream, where its own registry is
`<host>/styles/{style}/{name}.json`.

| `style` | Primitives | Families |
| --- | --- | --- |
| `base-nova` *(default)* | `@octanejs/base-ui` | 40 |
| `radix-nova` | `@octanejs/radix` | 44 |
| `aria-nova` | `@octanejs/aria` | 33 |

The bases currently ship different family counts; see the coverage table for remaining ports.
Switching `style` changes which primitive a component
is built on; the `data-slot` contract and component names stay identical, so your markup and
styling do not change.

A registry URL without the `{style}` segment resolves to the default style, so
`https://octanejs.dev/r/{name}.json` serves the Base UI variant.

### Serving it locally

```bash
pnpm --dir packages/shadcn registry:build   # regenerate from src/
pnpm --dir packages/shadcn registry:serve   # http://localhost:4517
```

Then point `components.json` at `http://localhost:4517/styles/{style}/{name}.json`, which is
what `playground/octane` does.

## Importing from the package

There is no barrel entry. Every family has its own subpath, so an app pulls in only what it
uses — the Radix base at the bare name, the others under their base:

```tsx
// Radix base (the bare subpaths)
import { Button } from '@octanejs/shadcn/Button';
import { Dialog, DialogContent, DialogTitle } from '@octanejs/shadcn/Dialog';

// React Aria base
import { Button } from '@octanejs/shadcn/react-aria/Button';

// Base UI base
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@octanejs/shadcn/base-ui/AlertDialog';

import '@octanejs/shadcn/theme.css';
```

Subpaths are `PascalCase` and map to the family, not the export: `AlertDialogTrigger` and its
siblings all come from `.../AlertDialog`. `cn` lives at `@octanejs/shadcn/cn`, shared types at
`@octanejs/shadcn/types`, and `useIsMobile` at `@octanejs/shadcn/hooks/use-mobile`.


Octane adaptations are uniform and documented per file: no `"use client"`,
refs as props, native events (`onInput` per keystroke), `asChild` and Portal
children composed as element descriptors, and children forwarding through the
compiler's `{props.children}` lowering.

## Evidence

Behavioral (jsdom), SSR, hydration-adoption, and differential suites — the
differential rig byte-compares fixtures against the vendored pinned upstream
React sources running real `radix-ui`. The full ledger (supported surface,
divergences, SSR status, flavor migration state) lives in
[status.json](./status.json) and the generated
[bindings status table](../../docs/bindings-status.md); scope and phase history
in [docs/shadcn-port-plan.md](../../docs/shadcn-port-plan.md).
