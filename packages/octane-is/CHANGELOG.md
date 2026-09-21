# @octanejs/octane-is

## 0.0.3

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

## 0.0.2

### Patch Changes

- a6d7f49: Remove the legacy `Context.Provider` alias from client, server, and native contexts. Provide values with `<Context value={value}>` or `createElement(Context, { value }, children)` instead. The compiler rejects statically recognized legacy Provider access with migration guidance, and Octane bindings now use contexts directly. Binding peer ranges accept Octane 0.3 alongside their previously supported runtime lines.
- Updated dependencies [debd7df]
- Updated dependencies [873f4d2]
- Updated dependencies [68a6690]
- Updated dependencies [c32e76b]
- Updated dependencies [a6d7f49]
- Updated dependencies [14fd908]
- Updated dependencies [893cc83]
  - octane@0.3.0

## 0.0.1

### Patch Changes

- 44d50db: Add the react-is 19.2.7 introspection surface for Octane elements, with pinned upstream tests, public types, and predicates that never execute components or lazy loaders.
