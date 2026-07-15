# Lexical Playground — Octane

An Octane rich-text editor built with
[`@octanejs/lexical`](../../packages/lexical). It is a focused counterpart to
[Lexical Playground](https://github.com/facebook/lexical/tree/main/packages/lexical-playground):
large enough to exercise the binding through real editor interactions without
claiming every feature in the upstream showcase.

```bash
pnpm --filter lexical-playground-example dev
# http://localhost:5210
```

## Wired features

- `LexicalComposer`, `ContentEditable`, `RichTextPlugin`, the Octane error
  boundary, editor theme, placeholder, and autofocus.
- History with working undo and redo.
- Paragraph, heading, quote, ordered-list, unordered-list, and checklist blocks.
- Bold, italic, underline, strikethrough, inline code, links, and hashtags.
- Tab indentation, Markdown shortcuts, and horizontal-rule decorator portals.
- A `/` component picker built with `LexicalTypeaheadMenuPlugin`. It can insert
  paragraphs, headings, quotes, lists, and dividers.

Try typing some text and selecting it before using the formatting toolbar. Type
`/heading` or `/list` to filter the component picker, then choose an option.
Markdown shortcuts such as `# `, `- `, `> `, and `---` are also active.

## Validation

The example is a browser-level fixture as well as a demo:

```bash
pnpm --filter lexical-playground-example typecheck
pnpm --filter lexical-playground-example build
pnpm --filter lexical-playground-example test:e2e
pnpm --filter lexical-playground-example test:e2e:dev
```

The E2E launch commands use POSIX inline environment syntax and are supported
on macOS/Linux (CI runs Ubuntu); `dev`, `typecheck`, and `build` are unaffected.

The deterministic Playwright journeys verify typing and formatting, history
undo/redo, and slash-picker block insertion. They also fail on uncaught page
errors and browser console errors. `test:e2e` builds the application first and
runs the contract against Vite's production preview server. `test:e2e:dev` runs
the same tests against Vite's development server for faster iteration.

## Not wired in this example

`@octanejs/lexical` has additional bindings that this focused application does
not currently render, including tables and table-of-contents UI, draggable
blocks, auto-embed, character limits, node menus, and nested composers. The
table node classes are registered so pasted/imported table content is valid,
but there is no table insertion UI here.

The binding itself does not yet provide real-time collaboration, the newer
extension-composer wrappers, or Lexical's React-based debug tree viewer. See the
[`@octanejs/lexical` status](../../packages/lexical/README.md#status) for the
current package-wide surface and known divergences.
