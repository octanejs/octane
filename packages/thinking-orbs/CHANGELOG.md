# @octanejs/thinking-orbs

## 0.1.3

### Patch Changes

- a6d7f49: Remove the legacy `Context.Provider` alias from client, server, and native contexts. Provide values with `<Context value={value}>` or `createElement(Context, { value }, children)` instead. The compiler rejects statically recognized legacy Provider access with migration guidance, and Octane bindings now use contexts directly. Binding peer ranges accept Octane 0.3 alongside their previously supported runtime lines.

## 0.1.2

### Patch Changes

- ddaa8c5: Promote Octane to beta and begin the 0.2 release line.

## 0.1.1

### Patch Changes

- 2527340: Add the initial Thinking Orbs binding with an Octane canvas component, animation
  presets, theme handling, and reduced-motion support.
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
