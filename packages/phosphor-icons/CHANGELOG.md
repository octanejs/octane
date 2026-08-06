# @octanejs/phosphor-icons

## 0.0.7

### Patch Changes

- Updated dependencies [46e1833]
- Updated dependencies [5a8e807]
  - octane@0.1.27

## 0.0.6

### Patch Changes

- Updated dependencies [1f01b08]
- Updated dependencies [48e2397]
  - octane@0.1.26

## 0.0.5

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - octane@0.1.25

## 0.0.4

### Patch Changes

- Updated dependencies [ec77602]
- Updated dependencies [29c5bdb]
- Updated dependencies [9b032d8]
- Updated dependencies [f9b2731]
- Updated dependencies [6714914]
  - octane@0.1.24

## 0.0.3

### Patch Changes

- Updated dependencies [c1ad31b]
  - octane@0.1.23

## 0.0.2

### Patch Changes

- 34f79ff: Add generated, tree-shakeable Phosphor icon components for Octane with all six weights, context defaults, SSR, and hydration support.
- 671c88c: Key the SVG primitives each icon renders, so mounting one no longer warns.

  Every icon passes its weight's primitives to `createElement` as a single array
  child, and octane treats an array child as a keyed list. Without keys it
  reconciled them by position and warned on every icon:

  ```
  Octane: each element in an array child should have a unique "key" prop
  ```

  Upstream never hits this — `@phosphor-icons/react` stores one `ReactElement`
  per weight, so React only ever sees a single child. This port stores
  `[tag, attributes]` tuples instead, to keep the generated icons
  tree-shakeable, which makes the keys this package's responsibility.

  A weight's primitives are a fixed, never-reordered sequence, so the index is
  their identity; pairing it with the tag means switching weight reuses a node
  where the element type matches at that position and replaces it where it does
  not, rather than patching a `<path>` into a `<circle>`.

- Updated dependencies [43df1f9]
- Updated dependencies [7a112b4]
  - octane@0.1.22
