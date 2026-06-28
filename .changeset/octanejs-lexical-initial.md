---
"@octanejs/lexical": patch
---

New package: `@octanejs/lexical` — Octane bindings for the Lexical rich-text editor
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

Verified byte-identical to real `@lexical/react` via differential tests (the same
fixture mounted on both, identical DOM after edits — basic text + a bullet list),
plus behavioral unit tests, plus an end-to-end slash-command typeahead in the
`examples/lexical-playground` app driven in a real browser. Collaboration (yjs) and
the extension host land incrementally toward full parity.
