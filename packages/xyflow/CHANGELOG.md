# @octanejs/xyflow

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
