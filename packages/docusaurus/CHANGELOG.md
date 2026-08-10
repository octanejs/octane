# @octanejs/docusaurus

## 0.0.18

### Patch Changes

- Updated dependencies [78316b4]
- Updated dependencies [4e53ef4]
- Updated dependencies [4cc7840]
- Updated dependencies [39b3e19]
- Updated dependencies [8c29020]
- Updated dependencies [97e65b9]
  - octane@0.1.34
  - @octanejs/mdx@0.1.31
  - @octanejs/remix-router@0.1.30
  - @octanejs/seo@0.0.19

## 0.0.17

### Patch Changes

- Updated dependencies [1fe297e]
- Updated dependencies [db0d495]
- Updated dependencies [677182d]
- Updated dependencies [3fb96df]
- Updated dependencies [677182d]
- Updated dependencies [4653a2e]
- Updated dependencies [7282555]
- Updated dependencies [3d09348]
- Updated dependencies [8cb40df]
- Updated dependencies [677182d]
- Updated dependencies [fc1c146]
- Updated dependencies [a84fcaa]
- Updated dependencies [217a0b5]
  - octane@0.1.33
  - @octanejs/mdx@0.1.30
  - @octanejs/remix-router@0.1.29
  - @octanejs/seo@0.0.18

## 0.0.16

### Patch Changes

- Updated dependencies [d453832]
- Updated dependencies [3152f0b]
- Updated dependencies [1c44117]
- Updated dependencies [cbd55ca]
- Updated dependencies [cdb501c]
  - octane@0.1.32
  - @octanejs/mdx@0.1.29
  - @octanejs/remix-router@0.1.28
  - @octanejs/seo@0.0.17

## 0.0.15

### Patch Changes

- Updated dependencies [80a9c7e]
- Updated dependencies [62d7f13]
- Updated dependencies [16df26e]
  - octane@0.1.31
  - @octanejs/mdx@0.1.28
  - @octanejs/remix-router@0.1.27
  - @octanejs/seo@0.0.16

## 0.0.14

### Patch Changes

- Updated dependencies [10011bb]
- Updated dependencies [081fa1e]
- Updated dependencies [60004f0]
- Updated dependencies [27758f5]
- Updated dependencies [136b0e3]
- Updated dependencies [d69ab86]
- Updated dependencies [1a27e19]
- Updated dependencies [7f6a134]
- Updated dependencies [ce68bb8]
- Updated dependencies [fbe0d39]
- Updated dependencies [9fa0b47]
  - octane@0.1.30
  - @octanejs/mdx@0.1.27
  - @octanejs/remix-router@0.1.26
  - @octanejs/seo@0.0.15

## 0.0.13

### Patch Changes

- Updated dependencies [8fb7990]
- Updated dependencies [23a2538]
  - octane@0.1.29
  - @octanejs/mdx@0.1.26
  - @octanejs/remix-router@0.1.25
  - @octanejs/seo@0.0.14

## 0.0.12

### Patch Changes

- Updated dependencies [2b98a33]
  - octane@0.1.28
  - @octanejs/mdx@0.1.25
  - @octanejs/remix-router@0.1.24
  - @octanejs/seo@0.0.13

## 0.0.11

### Patch Changes

- Updated dependencies [46e1833]
- Updated dependencies [5a8e807]
  - octane@0.1.27
  - @octanejs/mdx@0.1.24
  - @octanejs/remix-router@0.1.23
  - @octanejs/seo@0.0.12

## 0.0.10

### Patch Changes

- Updated dependencies [1f01b08]
- Updated dependencies [48e2397]
  - octane@0.1.26
  - @octanejs/mdx@0.1.23
  - @octanejs/remix-router@0.1.22
  - @octanejs/seo@0.0.11

## 0.0.9

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - @octanejs/mdx@0.1.22
  - octane@0.1.25
  - @octanejs/remix-router@0.1.21
  - @octanejs/seo@0.0.10

## 0.0.8

### Patch Changes

- Updated dependencies [ec77602]
- Updated dependencies [29c5bdb]
- Updated dependencies [9b032d8]
- Updated dependencies [f9b2731]
- Updated dependencies [6714914]
  - octane@0.1.24
  - @octanejs/mdx@0.1.21
  - @octanejs/remix-router@0.1.20
  - @octanejs/seo@0.0.9

## 0.0.7

### Patch Changes

- Updated dependencies [c1ad31b]
  - octane@0.1.23
  - @octanejs/mdx@0.1.20
  - @octanejs/remix-router@0.1.19
  - @octanejs/seo@0.0.8

## 0.0.6

### Patch Changes

- Updated dependencies [43df1f9]
- Updated dependencies [7a112b4]
  - octane@0.1.22
  - @octanejs/mdx@0.1.19
  - @octanejs/remix-router@0.1.18
  - @octanejs/seo@0.0.7

## 0.0.5

### Patch Changes

- Updated dependencies [10efc28]
- Updated dependencies [39bfc49]
- Updated dependencies [4863b39]
- Updated dependencies [ef82ba3]
  - octane@0.1.21
  - @octanejs/mdx@0.1.18
  - @octanejs/remix-router@0.1.17
  - @octanejs/seo@0.0.6

## 0.0.4

### Patch Changes

- 3983b13: Add Docusaurus document and client-module asset orchestration, a full SSR HTML
  composer, and the initial Octane-native classic documentation theme. Nested
  Docusaurus layout routes that share an absolute pathname now map correctly onto
  the Remix route hierarchy.
- 4c896b7: Add lazy client routing over the Docusaurus manifest, including browser and
  memory router factories, nested route rendering and context, and a Vite virtual
  module with statically analyzable route imports.
- d1526d9: Resolve classic theme links against the configured base URL and render footer copyright markup as Docusaurus-compatible HTML.
- 7551059: Add static route prerendering and client hydration over the lazy Docusaurus
  route graph, with matched-branch loading and adoptable Octane server markup.
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
  - @octanejs/mdx@0.1.17
  - @octanejs/remix-router@0.1.16
  - @octanejs/seo@0.0.5

## 0.0.3

### Patch Changes

- Updated dependencies [9d5d642]
- Updated dependencies [f469b3f]
- Updated dependencies [ac2ae2f]
- Updated dependencies [3aada64]
  - octane@0.1.19
  - @octanejs/mdx@0.1.16

## 0.0.2

### Patch Changes

- 7a90773: Add the first Docusaurus integration phases: a version-pinned headless
  config/plugin loader, a serializable route and data manifest with Vite aliases,
  and Docusaurus-shaped MDX compilation for Octane.
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
- Updated dependencies [e0c5490]
- Updated dependencies [e6a158e]
  - octane@0.1.18
  - @octanejs/mdx@0.1.15
