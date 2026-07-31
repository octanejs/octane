# @octanejs/shadcn

## 0.0.6

### Patch Changes

- Updated dependencies [10efc28]
- Updated dependencies [39bfc49]
- Updated dependencies [4863b39]
- Updated dependencies [ef82ba3]
  - octane@0.1.21
  - @octanejs/lucide@0.1.16
  - @octanejs/radix@0.1.20
  - @octanejs/sonner@0.1.16

## 0.0.5

### Patch Changes

- Updated dependencies [c6370b6]
- Updated dependencies [dd272ad]
- Updated dependencies [c151b71]
- Updated dependencies [66b51d8]
- Updated dependencies [a57c32a]
- Updated dependencies [e38a557]
- Updated dependencies [bd90e27]
- Updated dependencies [ae6811d]
- Updated dependencies [62d81b8]
  - octane@0.1.20
  - @octanejs/lucide@0.1.15
  - @octanejs/radix@0.1.19
  - @octanejs/sonner@0.1.15

## 0.0.4

### Patch Changes

- Updated dependencies [9d5d642]
- Updated dependencies [f469b3f]
- Updated dependencies [ac2ae2f]
- Updated dependencies [3aada64]
  - octane@0.1.19
  - @octanejs/lucide@0.1.14
  - @octanejs/radix@0.1.18
  - @octanejs/sonner@0.1.14

## 0.0.3

### Patch Changes

- Updated dependencies [c3ba5e0]
- Updated dependencies [430061e]
- Updated dependencies [a21ff46]
- Updated dependencies [1821f63]
- Updated dependencies [3db74e9]
- Updated dependencies [0d4ed9e]
- Updated dependencies [7bdf1fa]
- Updated dependencies [e1927d8]
- Updated dependencies [dac0e66]
- Updated dependencies [54c60fa]
- Updated dependencies [59a95d6]
- Updated dependencies [138fbd9]
- Updated dependencies [50c1ab5]
- Updated dependencies [ff0f898]
- Updated dependencies [e0c5490]
- Updated dependencies [e6a158e]
  - octane@0.1.18
  - @octanejs/sonner@0.1.13
  - @octanejs/lucide@0.1.13
  - @octanejs/radix@0.1.17

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
