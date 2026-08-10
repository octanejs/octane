# @octanejs/cmdk

## 0.1.16

### Patch Changes

- Updated dependencies [1fe297e]
- Updated dependencies [db0d495]
- Updated dependencies [677182d]
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
  - @octanejs/radix@0.1.32

## 0.1.15

### Patch Changes

- Updated dependencies [d453832]
- Updated dependencies [3152f0b]
- Updated dependencies [1c44117]
- Updated dependencies [cbd55ca]
- Updated dependencies [cdb501c]
  - octane@0.1.32
  - @octanejs/radix@0.1.31

## 0.1.14

### Patch Changes

- Updated dependencies [80a9c7e]
- Updated dependencies [62d7f13]
- Updated dependencies [16df26e]
  - octane@0.1.31
  - @octanejs/radix@0.1.30

## 0.1.13

### Patch Changes

- Updated dependencies [121ab45]
- Updated dependencies [10011bb]
- Updated dependencies [081fa1e]
- Updated dependencies [60004f0]
- Updated dependencies [27758f5]
- Updated dependencies [136b0e3]
- Updated dependencies [d69ab86]
- Updated dependencies [1a27e19]
- Updated dependencies [7f6a134]
- Updated dependencies [694ba09]
- Updated dependencies [ce68bb8]
- Updated dependencies [fbe0d39]
- Updated dependencies [9fa0b47]
  - @octanejs/radix@0.1.29
  - octane@0.1.30

## 0.1.12

### Patch Changes

- Updated dependencies [8fb7990]
  - octane@0.1.29
  - @octanejs/radix@0.1.28

## 0.1.11

### Patch Changes

- Updated dependencies [2b98a33]
  - octane@0.1.28
  - @octanejs/radix@0.1.27

## 0.1.10

### Patch Changes

- Updated dependencies [46e1833]
- Updated dependencies [5a8e807]
  - octane@0.1.27
  - @octanejs/radix@0.1.26

## 0.1.9

### Patch Changes

- Updated dependencies [1f01b08]
- Updated dependencies [48e2397]
  - octane@0.1.26
  - @octanejs/radix@0.1.25

## 0.1.8

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - octane@0.1.25
  - @octanejs/radix@0.1.24

## 0.1.7

### Patch Changes

- Updated dependencies [ec77602]
- Updated dependencies [29c5bdb]
- Updated dependencies [9b032d8]
- Updated dependencies [f9b2731]
- Updated dependencies [6714914]
  - octane@0.1.24
  - @octanejs/radix@0.1.23

## 0.1.6

### Patch Changes

- Updated dependencies [c1ad31b]
  - octane@0.1.23
  - @octanejs/radix@0.1.22

## 0.1.5

### Patch Changes

- Updated dependencies [43df1f9]
- Updated dependencies [7a112b4]
  - octane@0.1.22
  - @octanejs/radix@0.1.21

## 0.1.4

### Patch Changes

- Updated dependencies [10efc28]
- Updated dependencies [39bfc49]
- Updated dependencies [4863b39]
- Updated dependencies [ef82ba3]
  - octane@0.1.21
  - @octanejs/radix@0.1.20

## 0.1.3

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
  - @octanejs/radix@0.1.19

## 0.1.2

### Patch Changes

- Updated dependencies [9d5d642]
- Updated dependencies [f469b3f]
- Updated dependencies [ac2ae2f]
- Updated dependencies [3aada64]
  - octane@0.1.19
  - @octanejs/radix@0.1.18

## 0.1.1

### Patch Changes

- 8014e81: Rank filtered results with CSS `order` instead of relocating DOM nodes, render
  items that have not been scored yet, and key registration teardowns per item.

  Previously an item mounted while a search was active never rendered unless it
  carried an explicit `value`, ranking orphaned item nodes when they lived inside
  a keyed `@for`, source order never came back after a search was cleared, and
  removing the selected item alongside a sibling left nothing selected.

  `@octanejs/radix` is now a `workspace:*` sibling. It was pinned to the published
  `0.1.12` so the port exercised the release consumers install, but the repo has
  since made every sibling edge resolve through the workspace — an exact range
  builds against a stale copy of source that lives in this checkout, and
  `changeset version` rewrites it on release, desyncing the lockfile.

  Group navigation (alt+arrow) and the ranking itself follow the ranked order too:
  group stepping walked DOM siblings, and only matching items were ranked, which
  left a force-mounted non-match at the top of its container. Force-mounted items
  and groups also no longer keep a stale filter score — they register their value
  through the same hook as items, so they were scored once against the empty
  search and never refreshed, which let them outrank genuine matches.

  Controlled selection updates now keep the input and list
  `aria-activedescendant` synchronized with the selected option.

- ff0f898: Fix strict TSRX typechecking of source-published command menus, toast notifications, and editors. Preserve typed optional refs, CSS custom properties, editor contexts, and portal registries, and validate all three bindings from their real packed packages with `tsrx-tsc`.
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
  - @octanejs/radix@0.1.17
