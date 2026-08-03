---
'@octanejs/shadcn': patch
---

Serve all three primitive bases from the registry, selected the way shadcn selects its own.

Base and visual style compose into `components.json`'s single `style` field, which the CLI
substitutes into the registry URL — `{style}` and `{name}` are the only placeholders it
substitutes, and it never parses the style string. The registry now emits
`registry/styles/<style>/<name>.json` for `base-nova` (the default, on `@octanejs/base-ui`),
`radix-nova` and `aria-nova`, plus an un-styled copy of the default so a URL without a `{style}`
segment still resolves.

Adds `registry:serve`, which serves the registry over HTTP for local development — the port the
playground's `components.json` has always pointed at but which nothing in the repo served, so
`npx shadcn add @octane/…` could not previously work for anyone.

Verified end to end against the real shadcn CLI: each style installs its own base's primitive
with correctly pinned dependencies and rewritten consumer aliases.
