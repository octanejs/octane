# @octanejs/xyflow

## 0.1.11

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
  - @octanejs/zustand@0.1.56

## 0.1.10

### Patch Changes

- 601a8a2: Isolate the inner hook slots used by flow measurement, node and edge update queues, viewport helpers, and interactions. Preserve optional hook arguments so compiled consumers can measure visible nodes, call `fitView`, and use independent keyboard and connection subscriptions.
- @octanejs/zustand@0.1.55

## 0.1.9

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
  - @octanejs/zustand@0.1.55

## 0.1.8

### Patch Changes

- dc8f3cd: Correct authored type-only imports and exports so compiled consumer builds do not request nonexistent runtime exports or a runtime entry from `@react-types/shared`.
- @octanejs/zustand@0.1.54

## 0.1.7

### Patch Changes

- a6d7f49: Remove the legacy `Context.Provider` alias from client, server, and native contexts. Provide values with `<Context value={value}>` or `createElement(Context, { value }, children)` instead. The compiler rejects statically recognized legacy Provider access with migration guidance, and Octane bindings now use contexts directly. Binding peer ranges accept Octane 0.3 alongside their previously supported runtime lines.
- Updated dependencies [a6d7f49]
  - @octanejs/zustand@0.1.54

## 0.1.6

### Patch Changes

- Updated dependencies [911ed1d]
  - @octanejs/zustand@0.1.53

## 0.1.5

### Patch Changes

- ede01de: Accept native signal handles in DOM styles, including individual CSS properties and whole style values. Direct template styles update without rerunning component setup, and preserve signal cleanup, Suspense, server rendering, and hydration. Export `SignalCSSProperties` for signal-aware style objects while keeping `CSSProperties` compatible with ordinary CSS consumers.

  Keep binding CSS compatibility aliases pointed at plain `CSSProperties` when their layout helpers consume ordinary CSS values.

  Expose the signal style regression benchmark through the MCP benchmark tool.
- @octanejs/zustand@0.1.52

## 0.1.4

### Patch Changes

- Updated dependencies [1846318]
  - @octanejs/zustand@0.1.52

## 0.1.3

### Patch Changes

- ddaa8c5: Promote Octane to beta and begin the 0.2 release line.
- Updated dependencies [ddaa8c5]
  - @octanejs/zustand@0.1.51

## 0.1.2

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
  - @octanejs/zustand@0.1.50

## 0.1.1

### Patch Changes

- f3ab3dd: Keep system color mode updates responsive by isolating their state and effect hook slots.
- Updated dependencies [157543f]
- Updated dependencies [4d13159]
- Updated dependencies [a944ff3]
- Updated dependencies [f9f0d23]
- Updated dependencies [edf2b9d]
- Updated dependencies [9779569]
- Updated dependencies [96c86fc]
  - octane@0.1.50
  - @octanejs/zustand@0.1.49
