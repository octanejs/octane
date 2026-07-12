# @octanejs/lexical

## 0.1.3

### Patch Changes

- Updated dependencies [05fdef8]
- Updated dependencies [e9ebfbf]
- Updated dependencies [4ac4c98]
- Updated dependencies [c2129eb]
- Updated dependencies [4ac4c98]
- Updated dependencies [8a44bb5]
- Updated dependencies [6b0c244]
- Updated dependencies [d3cf678]
- Updated dependencies [05fdef8]
- Updated dependencies [d19d4f3]
- Updated dependencies [7e84258]
- Updated dependencies [2f8c6ed]
- Updated dependencies [8de4584]
- Updated dependencies [9be6ba5]
- Updated dependencies [db409de]
- Updated dependencies [4f3c6c8]
- Updated dependencies [62c3c4e]
- Updated dependencies [3c56d95]
- Updated dependencies [4c5b1d0]
- Updated dependencies [b732399]
- Updated dependencies [6d27cb0]
- Updated dependencies [a3784b1]
- Updated dependencies [fa77edf]
- Updated dependencies [f5c9dba]
- Updated dependencies [12d5410]
- Updated dependencies [d71f1fc]
- Updated dependencies [2f8c6ed]
- Updated dependencies [63e51e8]
- Updated dependencies [6d3b269]
- Updated dependencies [b171c6d]
- Updated dependencies [7f3d9c9]
- Updated dependencies [820baaf]
- Updated dependencies [c36cb32]
- Updated dependencies [c33f409]
- Updated dependencies [63e51e8]
- Updated dependencies [8fc8554]
- Updated dependencies [569daad]
- Updated dependencies [6b7b727]
- Updated dependencies [2ce7bc5]
- Updated dependencies [c6a23f5]
- Updated dependencies [c93aad5]
- Updated dependencies [2942afb]
- Updated dependencies [388b23c]
- Updated dependencies [352cff1]
- Updated dependencies [c7989eb]
- Updated dependencies [dda2854]
- Updated dependencies [dda2854]
- Updated dependencies [3a9d855]
- Updated dependencies [1f85217]
  - octane@0.1.4
  - @octanejs/floating-ui@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [71b5167]
- Updated dependencies [7b2acbd]
- Updated dependencies [a000fa2]
- Updated dependencies [71b5167]
- Updated dependencies [735f5ca]
- Updated dependencies [634c4b4]
- Updated dependencies [1987d47]
- Updated dependencies [fda2200]
- Updated dependencies [71b5167]
- Updated dependencies [fda2200]
- Updated dependencies [3431ec3]
- Updated dependencies [3afe217]
- Updated dependencies [1a1f1db]
- Updated dependencies [3431ec3]
- Updated dependencies [5e3858f]
- Updated dependencies [d2afbbb]
- Updated dependencies [1987d47]
- Updated dependencies [eb48930]
- Updated dependencies [3431ec3]
- Updated dependencies [87c5bc3]
  - octane@0.1.3
  - @octanejs/floating-ui@0.1.2

## 0.1.1

### Patch Changes

- 169c7c6: `NodeContextMenuPlugin` is now a faithful 1:1 port of `@lexical/react`, built on
  `@octanejs/floating-ui` (`useFloating`/`useRole`/`useDismiss`/`useListNavigation`/
  `useTypeahead`/`useInteractions` + `FloatingPortal`/`FloatingOverlay`/
  `FloatingFocusManager`) instead of the interim hand-rolled `@floating-ui/dom`
  re-implementation. `@octanejs/lexical` now depends on `@octanejs/floating-ui`.
- 541f80d: New package: `@octanejs/lexical` — Octane bindings for the Lexical rich-text editor
  (a port of `@lexical/react`, pinned to Lexical 0.46.0). Reuses Lexical's
  framework-agnostic core and reimplements the React binding layer on octane's hooks.
  It mirrors `@lexical/react`'s per-subpath module layout, so existing Lexical code
  ports by changing only the scope (`@lexical/react/X` → `@octanejs/lexical/X`).

  Landed:

  - **Core editor**: `LexicalComposer`, `LexicalComposerContext`, `ContentEditable`,
    `RichTextPlugin`, `PlainTextPlugin`, `LexicalErrorBoundary`, `useLexicalEditable`,
    `useLexicalSubscription`.
  - **Plugins**: `HistoryPlugin`, `OnChangePlugin`, `AutoFocusPlugin`,
    `ClearEditorPlugin`, `ListPlugin`, `CheckListPlugin`, `LinkPlugin`,
    `AutoLinkPlugin`, `HashtagPlugin`, `TabIndentationPlugin`,
    `MarkdownShortcutPlugin`, `TablePlugin`, `NodeEventPlugin`, `EditorRefPlugin`,
    `HorizontalRulePlugin`.
  - **Nodes**: `HorizontalRuleNode` (a decorator node, rendered through the decorator
    portal).
  - **Hooks**: `useLexicalNodeSelection`, `useLexicalTextEntity`,
    `useLexicalIsTextContentEmpty`.
  - **Menus / typeahead (P4)**: `LexicalTypeaheadMenuPlugin`, `LexicalNodeMenuPlugin`,
    `useBasicTypeaheadTriggerMatch`, `useDynamicPositioning`, the `LexicalMenu`
    renderer, `MenuOption`, plus `ClickableLinkPlugin`, `SelectionAlwaysOnDisplay`,
    and `useLexicalSlotRef`. A custom `menuRenderFn` returns a portal, exactly like
    `@lexical/react`.
  - **Advanced P4**: `LexicalNestedComposer`, `DecoratorBlockNode` /
    `$isDecoratorBlockNode`, `BlockWithAlignableContents`, `CollaborationContext` /
    `useCollaborationContext`, `CharacterLimitPlugin` / `useCharacterLimit`,
    `TableOfContentsPlugin`, `LexicalAutoEmbedPlugin` (`AutoEmbedOption`,
    `INSERT_EMBED_COMMAND`, `URL_MATCHER`), `DraggableBlockPlugin_EXPERIMENTAL`, and
    `NodeContextMenuPlugin` (`NodeContextMenuOption` / `NodeContextMenuSeparator`).
    `NodeContextMenuPlugin` is re-implemented on `@floating-ui/dom` (the React version
    uses React-only `@floating-ui/react`). `TreeView` is not ported — it renders
    `@lexical/devtools-core`'s React component.

  Verified byte-identical to real `@lexical/react` via differential tests (the same
  fixture mounted on both, identical DOM after edits — basic text + a bullet list),
  plus behavioral unit tests, plus an end-to-end slash-command typeahead in the
  `examples/lexical-playground` app driven in a real browser. Collaboration (yjs) and
  the extension host land incrementally toward full parity.

- Updated dependencies [c19f1aa]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [169c7c6]
- Updated dependencies [86ae0c5]
- Updated dependencies [357f841]
- Updated dependencies [6675ac7]
- Updated dependencies [f414710]
- Updated dependencies [894d51c]
- Updated dependencies [f44fb6b]
- Updated dependencies [056c441]
- Updated dependencies [aa9cc6e]
- Updated dependencies [0f57f20]
- Updated dependencies [f44fb6b]
- Updated dependencies [067efa3]
- Updated dependencies [f0c6c4d]
- Updated dependencies [dd24fd5]
- Updated dependencies [524939e]
- Updated dependencies [e8ee0a8]
- Updated dependencies [b680431]
- Updated dependencies [524939e]
- Updated dependencies [7f8dbc0]
- Updated dependencies [a13acd1]
- Updated dependencies [067efa3]
- Updated dependencies [524939e]
- Updated dependencies [894d51c]
- Updated dependencies [894d51c]
- Updated dependencies [1960647]
- Updated dependencies [e8ee0a8]
- Updated dependencies [93e2733]
- Updated dependencies [149800c]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [169c7c6]
- Updated dependencies [bbc3275]
- Updated dependencies [ed6afad]
- Updated dependencies [40bcb16]
- Updated dependencies [c842fb7]
- Updated dependencies [c62efa7]
- Updated dependencies [524939e]
- Updated dependencies [b3a9191]
- Updated dependencies [ffe32c4]
- Updated dependencies [e1f996b]
- Updated dependencies [6983478]
- Updated dependencies [fc36e15]
- Updated dependencies [524939e]
- Updated dependencies [405f06e]
- Updated dependencies [f50c829]
- Updated dependencies [b3a9191]
- Updated dependencies [dd24fd5]
- Updated dependencies [7042056]
- Updated dependencies [6983478]
- Updated dependencies [e031a7d]
- Updated dependencies [86ae0c5]
- Updated dependencies [a33cdd6]
- Updated dependencies [e8ee0a8]
- Updated dependencies [067efa3]
- Updated dependencies [fab1cb0]
- Updated dependencies [6983478]
- Updated dependencies [dd24fd5]
- Updated dependencies [149800c]
- Updated dependencies [6983478]
- Updated dependencies [cb9ad82]
- Updated dependencies [ea6352e]
- Updated dependencies [1987bd7]
- Updated dependencies [0c4d5a1]
- Updated dependencies [dd24fd5]
- Updated dependencies [fcac573]
- Updated dependencies [41aa22a]
- Updated dependencies [c842fb7]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [634fd52]
- Updated dependencies [149800c]
- Updated dependencies [aafaaa9]
- Updated dependencies [1987bd7]
- Updated dependencies [74cbff9]
- Updated dependencies [894d51c]
- Updated dependencies [0040cad]
- Updated dependencies [a3dce2f]
- Updated dependencies [3656e32]
- Updated dependencies [43d940d]
- Updated dependencies [a032c5c]
- Updated dependencies [7f8dbc0]
- Updated dependencies [c71d4f3]
- Updated dependencies [a3dce2f]
- Updated dependencies [c2f3f69]
- Updated dependencies [3656e32]
- Updated dependencies [1987bd7]
- Updated dependencies [f42e5b7]
- Updated dependencies [cc2bca1]
- Updated dependencies [6983478]
- Updated dependencies [1987bd7]
  - octane@0.1.2
  - @octanejs/floating-ui@0.1.1
