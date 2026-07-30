---
'@octanejs/monaco-editor': patch
---

Add an Octane binding for `@monaco-editor/react@4.7.0`.

The package reuses `monaco-editor` and `@monaco-editor/loader` while providing
compiled `Editor` and `DiffEditor` components, `useMonaco`, controlled model and
path synchronization, view-state restoration, validation callbacks, and
ownership-aware cleanup without a React runtime dependency.
