# @octanejs/docusaurus

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
