# @octanejs/pierre-diffs

## 0.0.2

### Patch Changes

- 0c8ec2f: Add `@octanejs/pierre-diffs`, an Octane port of the `@pierre/diffs/react` entry of `@pierre/diffs` 1.6.1. It provides `FileDiff`, `MultiFileDiff`, `PatchDiff`, `File`, `UnresolvedFile` and `CodeView` (controlled or uncontrolled, with its imperative `ref` handle), `Virtualizer`, `WorkerPoolContextProvider` and `WorkerPoolContext`, `EditProvider` and `EditContext`, their hooks, and the core types the React entry re-exports. `@pierre/diffs` stays the framework-neutral dependency for parsing, highlighting, workers, editing and SSR preloading. Server rendering with `prerenderedHTML` emits the same declarative shadow root as upstream, and hydration adopts it.
