---
'@octanejs/shadcn': patch
---

Add `collapsible` to the Base UI base, at `@octanejs/shadcn/base-ui/Collapsible`.

Runs on `@octanejs/base-ui`'s Collapsible. `CollapsibleContent` maps to Base UI's
`Collapsible.Panel` — the same part rename this base already makes for `accordion` — while the
exported names and all three `data-slot` values stay as shadcn defines them.

The family carries no class strings in any base, so there is no styling to verify.
