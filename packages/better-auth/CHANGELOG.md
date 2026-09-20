# @octanejs/better-auth

## 0.0.6

### Patch Changes

- 83ee964: Update Better Auth to 1.7.4, including initial session hydration through the existing client adapter. Update TanStack Devtools core to 0.14.2 and validate the unchanged adapter against React Devtools 0.10.12.

  Update the supported Wagmi adapter to core 3.6.5 and connectors 8.2.0, with compatibility against Wagmi 3.7.7.

## 0.0.5

### Patch Changes

- a6d7f49: Remove the legacy `Context.Provider` alias from client, server, and native contexts. Provide values with `<Context value={value}>` or `createElement(Context, { value }, children)` instead. The compiler rejects statically recognized legacy Provider access with migration guidance, and Octane bindings now use contexts directly. Binding peer ranges accept Octane 0.3 alongside their previously supported runtime lines.

## 0.0.4

### Patch Changes

- ddaa8c5: Promote Octane to beta and begin the 0.2 release line.

## 0.0.3

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

## 0.0.2

### Patch Changes

- ccb1b9a: add an Octane-native Better Auth client binding with session and plugin atom hooks
- Updated dependencies [157543f]
- Updated dependencies [4d13159]
- Updated dependencies [a944ff3]
- Updated dependencies [f9f0d23]
- Updated dependencies [edf2b9d]
- Updated dependencies [9779569]
- Updated dependencies [96c86fc]
  - octane@0.1.50
