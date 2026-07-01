# Lexical Playground — octane

The octane counterpart of [facebook/lexical's `lexical-playground`](https://github.com/facebook/lexical/tree/main/packages/lexical-playground):
the same Lexical rich-text editor, but rendered by **octane** via
[`@octanejs/lexical`](../../packages/lexical) instead of React. If this works, the
binding works.

```bash
pnpm --filter lexical-playground-example dev   # http://localhost:5210
```

## What it exercises

Everything in `@octanejs/lexical` Phases 1–3, in a real app:

- **Editor core** — `LexicalComposer`, `ContentEditable`, `RichTextPlugin`,
  `LexicalErrorBoundary`, the playground theme + placeholder.
- **Plugins** — History (undo/redo), List + CheckList, Link, Hashtag,
  TabIndentation, Markdown shortcuts, HorizontalRule (a decorator node, rendered
  through the decorator portal), AutoFocus.
- **A formatting toolbar** that tracks the selection's text formats + block type
  (via `registerUpdateListener`) and dispatches Lexical core commands — the same
  pattern as the playground's `ToolbarPlugin`.

Try: type Markdown (`# `, `- `, `> `, `---`, `` ` ``), `#hashtags`, toggle formats
and block types from the toolbar, undo/redo.

## Not yet wired here

The full playground has more surface than this example currently exercises. Two
distinct reasons:

- **Ported, just not wired in yet** — the binding plugins exist in `@octanejs/lexical`
  (`LexicalTypeaheadMenuPlugin`, `LexicalDraggableBlockPlugin`, `LexicalTablePlugin`,
  the node-menu / context-menu family). Mentions/emoji typeahead, draggable blocks, and
  the tables UI can be built on top of them here.
- **Playground-specific custom nodes** — image & equation nodes, comments, etc. are the
  playground's own `DecoratorNode`s, not `@lexical/react` modules; they'd be ported as
  app code.

Real-time collaboration is the one feature still blocked on a binding module
(`LexicalCollaborationPlugin`). This example grows as these land.
