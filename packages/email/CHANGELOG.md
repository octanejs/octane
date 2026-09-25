# @octanejs/email

## 0.0.8

### Patch Changes

- Updated dependencies [4b235d2]
- Updated dependencies [411c555]
- Updated dependencies [ac2a217]
- Updated dependencies [6e86908]
- Updated dependencies [b9b0bc4]
- Updated dependencies [c3dda51]
  - octane@0.6.0

## 0.0.7

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

## 0.0.6

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

## 0.0.5

### Patch Changes

- a6d7f49: Remove the legacy `Context.Provider` alias from client, server, and native contexts. Provide values with `<Context value={value}>` or `createElement(Context, { value }, children)` instead. The compiler rejects statically recognized legacy Provider access with migration guidance, and Octane bindings now use contexts directly. Binding peer ranges accept Octane 0.3 alongside their previously supported runtime lines.

## 0.0.4

### Patch Changes

- ede01de: Accept native signal handles in DOM styles, including individual CSS properties and whole style values. Direct template styles update without rerunning component setup, and preserve signal cleanup, Suspense, server rendering, and hydration. Export `SignalCSSProperties` for signal-aware style objects while keeping `CSSProperties` compatible with ordinary CSS consumers.

  Keep binding CSS compatibility aliases pointed at plain `CSSProperties` when their layout helpers consume ordinary CSS values.

  Expose the signal style regression benchmark through the MCP benchmark tool.

## 0.0.3

### Patch Changes

- ddaa8c5: Promote Octane to beta and begin the 0.2 release line.

## 0.0.2

### Patch Changes

- 2542f4c: Add React Email's email-safe components, Markdown, syntax highlighting, Tailwind processing, static renderer, and export/development CLI for Octane.
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
