# @octanejs/tiptap

[TipTap](https://tiptap.dev) for the
[Octane](https://github.com/octanejs/octane) UI framework.

This package reuses the framework-independent `@tiptap/core` and `@tiptap/pm`
packages and ports the editor binding layer from `@tiptap/react` to Octane. It is
pinned to **TipTap 3.28.0** and re-exports the public `@tiptap/core` API from its
root entry.

```bash
pnpm add @octanejs/tiptap @tiptap/starter-kit
```

```tsx
import { EditorContent, useEditor } from '@octanejs/tiptap';
import StarterKit from '@tiptap/starter-kit';

export function RichTextEditor() @{
	const editor = useEditor({
		extensions: [StarterKit],
		content: '<p>Hello from TipTap and Octane.</p>',
	});

	<EditorContent editor={editor} />
}
```

## Current scope

The binding includes:

- `useEditor`, including create/update/recreate and deferred-destroy lifecycle
  behavior;
- `useEditorState`, with selector-based transaction subscriptions and deep-equal
  bailout behavior;
- `EditorContext`, `EditorProvider`, `EditorConsumer`, and `useCurrentEditor`;
- `EditorContent` / `PureEditorContent` for adopting, switching, resetting, and
  exposing an editor DOM while owning its portal registry;
- `Tiptap`, `Tiptap.Content`, `useTiptap`, and `useTiptapState`;
- `ReactRenderer`, `ReactNodeViewRenderer`, `ReactMarkViewRenderer`,
  `useReactNodeView`, and the NodeView/MarkView wrapper and content components
  for custom Octane editor views; and
- `BubbleMenu` and `FloatingMenu` from the `@octanejs/tiptap/menus` subpath.

The public names follow `@tiptap/react` so existing TipTap extensions can keep
their renderer declarations while their components move to Octane. Despite the
compatibility names, the implementation does not install or render through
React.

For the pinned 3.28.0 release, the root and `./menus` runtime export surfaces
match `@tiptap/react`. Package-boundary tests lock those exports and the client
module directives, while shared-fixture differential tests exercise the same
editor and custom-view components through both bindings.

On the server, editor construction is suppressed, hook snapshots use a `null`
editor, and menu portals emit no detached target. Set `immediatelyRender: false`
when the editor should remain nullable through the initial client render as
well. The binding's SSR and hydration suite verifies deferred server output,
adoption of the existing host DOM, and creation of the live editor after
hydration.

Real-browser coverage complements the jsdom suite for contracts that require a
layout engine: caret-preserving input, text selection, NodeView dragging, and
BubbleMenu/FloatingMenu visibility and positioning.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
