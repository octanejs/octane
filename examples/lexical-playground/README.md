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

## Not yet ported (needs later phases)

The full playground's mentions/emoji typeahead, draggable blocks, tables UI, image
& equation nodes, comments, and collaboration require `@octanejs/lexical` Phases
4–6. This example grows as those land.
