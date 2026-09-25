# @octanejs/blocknote

An Octane adapter for [`@blocknote/core`](https://www.blocknotejs.org/docs/reference/editor/overview).

This package is private while the provenance of two retained context/hook files
is resolved. It is not ready for an MIT-only release; see [UPSTREAM.md](./UPSTREAM.md).

## Planned installation (after release)

```sh
npm install @octanejs/blocknote @blocknote/core@0.53.0 octane
pnpm add @octanejs/blocknote @blocknote/core@0.53.0 octane
```

Import BlockNote's framework-neutral editor styles once in your application:

```ts
import '@blocknote/core/style.css';
```

## Usage

```tsrx
import { BlockNoteView, useCreateBlockNote } from '@octanejs/blocknote';

export function Editor() @{
	const editor = useCreateBlockNote({
		initialContent: [{ type: 'paragraph', content: 'Hello from Octane' }],
	});

	<BlockNoteView
		editor={editor}
		onChange={(currentEditor) => console.log(currentEditor.document)}
	/>
}
```

`BlockNoteView` mounts the core editor, synchronizes `editable`, subscribes to
content and selection changes, supplies `BlockNoteContext`, and unmounts cleanly.

The view follows the system color scheme by default. Set `theme="light"` or
`theme="dark"` to override it; the wrapper exposes the corresponding CSS class
alongside `bn-root` for the core stylesheet. Application-owned UI and theme
colors remain the application's responsibility. Without an explicit theme, SSR
and the initial client render use light mode; the browser preference is applied
after hydration.

`useCreateBlockNote` retains an editor until its dependency list changes.
`BlockNoteView` owns DOM mounting and unmounting. The pinned core API does not
expose a public `destroy()` method; collaboration providers supplied by the
application remain application-owned.

Set `renderEditor={false}` to provide `BlockNoteViewEditor` yourself among the
view's children. Other children can implement application-owned toolbars, menus,
or status UI and may call `useBlockNoteEditor`.

## Scope

This package is an Octane adapter for the framework-neutral `@blocknote/core`
package. It does not ship the upstream React UI components. Two retained
context/hook files derive from the earlier mechanical port; see
[UPSTREAM.md](./UPSTREAM.md) for the unresolved ownership and licensing boundary.
