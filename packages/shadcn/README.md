# @octanejs/shadcn

shadcn/ui for the [octane](https://github.com/octanejs/octane) renderer — a port
of the **Radix base** of [shadcn-ui/ui](https://github.com/shadcn-ui/ui) onto
octane's hooks and native events, built on
[`@octanejs/radix`](../radix).

Upstream pin: `shadcn-ui/ui@4baadbc6` + CLI `shadcn@4.14.1`.

## What ships

- **40 component families (~185 exports)**: the full Tier-1 static set, all 24
  radix-backed Tier-2 components, and the first Tier-3 composites (Sidebar with
  `useSidebar`/`useIsMobile`, Field), plus `cn()` and the default neutral theme
  tokens (`@octanejs/shadcn/theme.css`).
- **Two consumption modes**: import from the package entry, or install
  components AS SOURCE with the upstream shadcn CLI against the generated
  registry (`registry/`, 47 items — `pnpm registry:build` / `registry:check`).
- **Styling flavors**: components are migrating to the default-Tailwind
  (utilities-inlined) flavor — class strings work against any Tailwind v4 build
  with the shadcn theme tokens. The not-yet-migrated families still carry the
  upstream `cn-*` semantic hooks and need a shadcn style sheet (e.g.
  `style-nova`). `status.json` lists exactly which families are which.

```tsx
import { Button, Dialog, Tabs } from '@octanejs/shadcn';
import '@octanejs/shadcn/theme.css';
```

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
