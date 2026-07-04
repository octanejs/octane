---
"@octanejs/base-ui": patch
---

New binding: `@octanejs/base-ui` — Base UI (`@base-ui/react`) ported to the
octane renderer.

Phase 0 foundation: the shared composition engine (`useRender` / `useRenderElement` /
`mergeProps` — Base UI's universal `render`-prop model, over octane's
`cloneElement`/`createElement`; native events made `preventBaseUIHandler`-able) and the
first component (`Separator`). Ported at full fidelity from `mui/base-ui` `v1.6.0`
and verified byte-identical against the real `@base-ui/react` via differential
parity tests. Public API mirrors Base UI's deep-subpath imports
(`@octanejs/base-ui/separator`, `/use-render`, `/merge-props`). See
`docs/base-ui-migration-plan.md` for the phased plan.
