# @octanejs/to-print

## 0.0.13

### Patch Changes

- Updated dependencies [4b235d2]
- Updated dependencies [411c555]
- Updated dependencies [ac2a217]
- Updated dependencies [6e86908]
- Updated dependencies [b9b0bc4]
- Updated dependencies [c3dda51]
  - octane@0.6.0

## 0.0.12

### Patch Changes

- Updated dependencies [3390f40]
- Updated dependencies [d285bd7]
- Updated dependencies [701b8c3]
- Updated dependencies [4f25786]
- Updated dependencies [afc0bee]
- Updated dependencies [752d750]
- Updated dependencies [2d46905]
- Updated dependencies [a95c2dc]
- Updated dependencies [fd81578]
- Updated dependencies [bdd7db7]
- Updated dependencies [47580bd]
  - octane@0.5.0

## 0.0.11

### Patch Changes

- Updated dependencies [3a859dd]
- Updated dependencies [620769b]
- Updated dependencies [dbcabb2]
- Updated dependencies [92227f6]
- Updated dependencies [6580880]
- Updated dependencies [db35ac1]
- Updated dependencies [f209f7c]
- Updated dependencies [a2c3e07]
- Updated dependencies [a2c3e07]
- Updated dependencies [34e83ce]
  - octane@0.4.0

## 0.0.10

### Patch Changes

- a6d7f49: Remove the legacy `Context.Provider` alias from client, server, and native contexts. Provide values with `<Context value={value}>` or `createElement(Context, { value }, children)` instead. The compiler rejects statically recognized legacy Provider access with migration guidance, and Octane bindings now use contexts directly. Binding peer ranges accept Octane 0.3 alongside their previously supported runtime lines.

## 0.0.9

### Patch Changes

- 5ead1ff: Add owner-bound signal declarations, async derivations and keyed streams, direct native signal bindings, and independent hydration infrastructure. Add request-local server-call context, bounded streamed RPC, and explicitly batched independent reads. Preserve operation identity and cancellation boundaries across navigation and uncertain acknowledgements.

  Allow a later widget activation to retry a failed framework-loaded stylesheet
  without discarding queued interactions or revealing the widget before CSS loads.

  Support renderer-free global signal and streamed-state activation for hosts that
  retain server-owned HTML. Adopt initial document seeds before behavior reads,
  preserve early edits, bind native control properties without reconciliation, and
  let envelope owners emit the early capture script before interactive markup
  without duplicating it in rendered fragments.

  Catalog the new core runtime diagnostics while preserving their error classes,
  and verify the published streaming bootstrap subpath and inline script export.

  Keep individual and batched server calls on the page's origin when an authored
  base element points to another origin.

  Keep reusable DOM, CSS, and component prop types scalar while allowing direct
  signal bindings at native JSX sites, preserving existing binding consumers.
  Use scalar public props for Zag's state-machine normalization results and
  to-print's imperative iframe options.

## 0.0.8

### Patch Changes

- ddaa8c5: Promote Octane to beta and begin the 0.2 release line.

## 0.0.7

### Patch Changes

- Updated dependencies [9321d39]
- Updated dependencies [fdb711a]
- Updated dependencies [5e80135]
- Updated dependencies [ad499d0]
- Updated dependencies [892da9a]
- Updated dependencies [babf8d7]
- Updated dependencies [2785a2f]
- Updated dependencies [df82fbc]
- Updated dependencies [0824502]
- Updated dependencies [47c8f54]
  - octane@0.1.51

## 0.0.6

### Patch Changes

- Updated dependencies [157543f]
- Updated dependencies [4d13159]
- Updated dependencies [a944ff3]
- Updated dependencies [f9f0d23]
- Updated dependencies [edf2b9d]
- Updated dependencies [9779569]
- Updated dependencies [96c86fc]
  - octane@0.1.50

## 0.0.5

### Patch Changes

- Updated dependencies [8adc693]
- Updated dependencies [a51c8c6]
  - octane@0.1.49

## 0.0.4

### Patch Changes

- Updated dependencies [3ca30fc]
- Updated dependencies [efdc8cb]
- Updated dependencies [922df8c]
- Updated dependencies [8a8afd8]
- Updated dependencies [37a8ca1]
- Updated dependencies [c84edbb]
- Updated dependencies [d5175ca]
- Updated dependencies [4a4996e]
  - octane@0.1.48

## 0.0.3

### Patch Changes

- Updated dependencies [af0d999]
- Updated dependencies [c800a1f]
- Updated dependencies [c1bb057]
- Updated dependencies [97b9349]
- Updated dependencies [4393bea]
- Updated dependencies [7dfef16]
- Updated dependencies [7e62361]
- Updated dependencies [964783a]
- Updated dependencies [d3dbd78]
  - octane@0.1.47

## 0.0.2

### Patch Changes

- b536a52: Add Octane bindings for wouter 3.10.0, html-react-parser 6.1.7, use-stick-to-bottom 1.1.6, react-image-crop 11.1.2, react-content-loader 7.1.2, react-to-print 3.3.0, react-calendar 6.0.1, and @formkit/auto-animate 0.10.0.
- Updated dependencies [7e96f71]
- Updated dependencies [d7226ff]
  - octane@0.1.46
