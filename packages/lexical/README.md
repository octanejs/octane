# @octanejs/lexical

[Lexical](https://lexical.dev) for the [octane](https://github.com/octanejs/octane) UI framework.

Lexical is an extensible rich-text editor framework. This package reuses Lexical's
framework-agnostic core (`lexical`, `@lexical/rich-text`, `@lexical/history`,
`@lexical/list`, …) and reimplements the [`@lexical/react`](https://www.npmjs.com/package/@lexical/react)
binding layer on octane's hooks. It mirrors `@lexical/react`'s **per-subpath module
layout** (that package has no root barrel), so existing Lexical code ports by changing
only the scope:

```tsx
// before
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
// after
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';

function MyPlugin() {
  const [editor] = useLexicalComposerContext();
  // …
}
```

A convenience root barrel (`@octanejs/lexical`) re-exporting everything is also
provided, but the per-subpath paths above are the drop-in form.

Pinned to **Lexical 0.46.0**.

## Status

Near-complete `@lexical/react` parity — **35 of 39 modules ported** (Lexical 0.46.0).
Parity is verified two ways: **differential** tests (the same `.tsrx` fixture run on
octane *and* the real `@lexical/react`, asserting byte-identical DOM) plus ports of
Lexical's own unit tests onto octane's harness.

Landed: the composer + context (`LexicalComposer`, `LexicalComposerContext`,
`LexicalNestedComposer`), the editable surface (`LexicalContentEditable`,
`LexicalErrorBoundary`), the text bindings (`LexicalPlainTextPlugin`,
`LexicalRichTextPlugin`), and the full plugin/menu set — history, list + check-list,
link + clickable-link, hashtag, tab-indentation, markdown shortcuts, horizontal-rule,
table, table-of-contents, auto-focus / -link / -embed, clear-editor, character-limit,
draggable-block, node-event, on-change, selection-always-on-display, and the
typeahead / node-menu / node-context-menu family — plus the `useLexical*` hooks and
`LexicalCollaborationContext`.

The 4 not-yet-ported modules are each deferred for a specific reason, not merely
undone:

- `LexicalCollaborationPlugin` — real-time Yjs collaboration. A genuine binding-layer
  port (it wraps the framework-agnostic `@lexical/yjs`), deferred until there's a
  two-peer Yjs harness to verify sync: the differential DOM-parity suite the other
  modules rely on can't meaningfully exercise live collaboration.
- `LexicalExtensionComposer` + `LexicalExtensionEditorComposer` — the newer
  extension-builder composer API. Thin wrappers over a separate React-only subsystem
  (`@lexical/react/ReactExtension` + `ReactProviderExtension`); the classic
  `LexicalComposer` path here is fully supported.
- `LexicalTreeView` — the debug tree viewer. A thin wrapper over
  `@lexical/devtools-core`'s `TreeView`, which is itself a React component (React is
  its peer dependency) — porting it means porting that separate devtools UI.

## How it works

The agnostic `@lexical/*` packages contain no React code, so they're consumed
directly. Only `@lexical/react`'s components/hooks are reimplemented — translating
React hooks to octane's (1:1 in nearly all cases), `forwardRef` to octane's
ref-as-prop, `@floating-ui/react` to `@floating-ui/dom`, and the class-based
`LexicalErrorBoundary` to octane's `<ErrorBoundary>`.

Lexical node classes require one core module identity. The package manifest marks
`lexical` as a Vite prebundle exclusion, and Octane's Vite adapter applies that hint
automatically so a cold dependency crawl cannot mix optimizer generations.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
