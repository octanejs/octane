# @octanejs/streamdown

## 0.1.10

### Patch Changes

- Updated dependencies [80a9c7e]
- Updated dependencies [62d7f13]
- Updated dependencies [16df26e]
  - octane@0.1.31

## 0.1.9

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

## 0.1.8

### Patch Changes

- Updated dependencies [8fb7990]
  - octane@0.1.29

## 0.1.7

### Patch Changes

- Updated dependencies [2b98a33]
  - octane@0.1.28

## 0.1.6

### Patch Changes

- Updated dependencies [46e1833]
- Updated dependencies [5a8e807]
  - octane@0.1.27

## 0.1.5

### Patch Changes

- Updated dependencies [1f01b08]
- Updated dependencies [48e2397]
  - octane@0.1.26

## 0.1.4

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - octane@0.1.25

## 0.1.3

### Patch Changes

- Updated dependencies [ec77602]
- Updated dependencies [29c5bdb]
- Updated dependencies [9b032d8]
- Updated dependencies [f9b2731]
- Updated dependencies [6714914]
  - octane@0.1.24

## 0.1.2

### Patch Changes

- Updated dependencies [c1ad31b]
  - octane@0.1.23

## 0.1.1

### Patch Changes

- 42b4b75: Avoid rendering empty code block action chrome when every code control is disabled.
- 42b4b75: Add a complete Streamdown 2.5.0 binding for Octane.

  The root entry ports Streamdown's streaming and static Markdown renderer,
  contexts, controls, code blocks, tables, images, custom renderers, animation,
  SSR, and hydration without a React runtime dependency. The official code,
  math, Mermaid, and CJK plugins are available through `./code`, `./math`,
  `./mermaid`, and `./cjk`. Published and locally linked consumers receive
  precompiled client and server JavaScript plus declarations instead of raw TSRX
  source.

- Updated dependencies [43df1f9]
- Updated dependencies [7a112b4]
  - octane@0.1.22
