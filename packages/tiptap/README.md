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

The initial binding includes:

- `useEditor`, including create/update/recreate and deferred-destroy lifecycle
  behavior;
- `useEditorState`, with selector-based transaction subscriptions and deep-equal
  bailout behavior;
- `EditorContext`, `EditorProvider`, `EditorConsumer`, and `useCurrentEditor`;
- `EditorContent` / `PureEditorContent` for adopting, switching, resetting, and
  exposing the DOM of a normal `@tiptap/core` editor; and
- `Tiptap`, `Tiptap.Content`, `useTiptap`, and `useTiptapState`.

The portal bridge required by custom Octane NodeViews and MarkViews is the next
stage. `ReactRenderer`, `ReactNodeViewRenderer`, `ReactMarkViewRenderer`,
`useReactNodeView`, the NodeView wrapper/content components, and the `./menus`
entry are therefore not part of this release yet. In particular, importing
`@octanejs/tiptap/menus` is intentionally unsupported until `BubbleMenu` and
`FloatingMenu` have working Octane implementations.

On the server, editor construction is suppressed and hook snapshots use a `null`
editor. Set `immediatelyRender: false` when the editor should remain nullable
through the initial client render as well. The binding's SSR and hydration suite
verifies deferred server output, adoption of the existing host DOM, and creation
of the live editor after hydration.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
