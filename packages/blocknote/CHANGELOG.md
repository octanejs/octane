# @octanejs/blocknote

## 0.1.1

### Patch Changes

- 45ee943: Publish `@octanejs/blocknote` as a headless BlockNote editor for Octane. It adds
  `BlockNoteViewRaw` and `BlockNoteViewEditor`, which mount a real `@blocknote/core`
  editor, along with the `useEditorChange`, `useEditorSelectionChange`, and
  `usePrefersColorScheme` hooks. Server rendering emits the view shell and hydrates without a
  color-scheme mismatch. The package is independently authored under MIT.
  None of the MPL-2.0 `@blocknote/react` source is included, and the default UI
  (toolbars, menus, side menu, comments) is not part of this release.
- Updated dependencies [4b235d2]
- Updated dependencies [411c555]
- Updated dependencies [ac2a217]
- Updated dependencies [6e86908]
- Updated dependencies [b9b0bc4]
- Updated dependencies [c3dda51]
  - octane@0.6.0
