---
'@octanejs/shadcn': patch
---

`@octanejs/shadcn` now depends on its `@octanejs/lucide`, `@octanejs/radix` and
`@octanejs/sonner` siblings through the `workspace:*` protocol, like every other
package in the repo. The exact-version pins resolved those siblings from the npm
registry instead of the workspace, so the package built against stale published
copies, and `changeset version` rewrote the pins on every release, which left
`pnpm-lock.yaml` out of date and failed the release job's frozen install.
`pnpm pack` still substitutes the concrete sibling versions into the published
manifest, so the published dependency ranges are unchanged in form.
