# @octanejs/shadcn

## 0.0.2

### Patch Changes

- 6d85dcb: The generated shadcn registry resolves sibling `workspace:*` specifiers to the
  sibling's current version, so the install specs the upstream shadcn CLI reads
  stay installable from npm. The registry is regenerated at release time, which
  keeps those pins tracking the versions each release actually ships.
- 5fc18b7: `@octanejs/shadcn` now depends on its `@octanejs/lucide`, `@octanejs/radix` and
  `@octanejs/sonner` siblings through the `workspace:*` protocol, like every other
  package in the repo. The exact-version pins resolved those siblings from the npm
  registry instead of the workspace, so the package built against stale published
  copies, and `changeset version` rewrote the pins on every release, which left
  `pnpm-lock.yaml` out of date and failed the release job's frozen install.
  `pnpm pack` still substitutes the concrete sibling versions into the published
  manifest, so the published dependency ranges are unchanged in form.
- Updated dependencies [bd31a2d]
- Updated dependencies [9e0ef45]
- Updated dependencies [dea219b]
- Updated dependencies [2374980]
- Updated dependencies [2374980]
- Updated dependencies [ac687f8]
- Updated dependencies [7997d39]
- Updated dependencies [eb69cb6]
  - octane@0.1.17
  - @octanejs/lucide@0.1.12
  - @octanejs/radix@0.1.16
  - @octanejs/sonner@0.1.12
