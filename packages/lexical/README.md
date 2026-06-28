# @octanejs/lexical

[Lexical](https://lexical.dev) for the [octane](https://github.com/octanejs/octane) renderer.

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

Built incrementally to full `@lexical/react` parity. See the project plan for the
phased roadmap (foundation → core editor → plugins → menus → collaboration →
extension host). Parity is verified two ways: **differential** tests (the same
`.tsrx` fixture run on octane *and* the real `@lexical/react`, asserting
byte-identical DOM) plus ports of Lexical's own unit tests onto octane's harness.

Currently landed:

- `LexicalComposerContext`, `createLexicalComposerContext`, `useLexicalComposerContext`

## How it works

The agnostic `@lexical/*` packages contain no React code, so they're consumed
directly. Only `@lexical/react`'s components/hooks are reimplemented — translating
React hooks to octane's (1:1 in nearly all cases), `forwardRef` to octane's
ref-as-prop, `@floating-ui/react` to `@floating-ui/dom`, and the class-based
`LexicalErrorBoundary` to octane's `<ErrorBoundary>`.
