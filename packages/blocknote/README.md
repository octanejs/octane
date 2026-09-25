# @octanejs/blocknote

Headless [BlockNote](https://www.blocknotejs.org) editor for Octane. It covers the editor surface of `@blocknote/react@0.53.0` without the default UI, and uses `@blocknote/core` unchanged.

## Install

```bash
npm install @octanejs/blocknote
pnpm add @octanejs/blocknote
```

## Usage

```tsx
import { BlockNoteViewRaw, useCreateBlockNote } from '@octanejs/blocknote';

export function Editor() @{
	const editor = useCreateBlockNote({
		initialContent: [{ type: 'paragraph', content: 'Hello' }],
	});

	<BlockNoteViewRaw editor={editor} onChange={() => console.log(editor.document)} />
}
```

`BlockNoteViewRaw` imports `@blocknote/core/style.css`. Toolbars, menus, and other UI are yours to build. Render them as children, read the editor with `useBlockNoteEditor()`, and use `renderEditor={false}` with `<BlockNoteViewEditor />` to control where the editable area goes.

## Exports

- `BlockNoteViewRaw`, `BlockNoteViewEditor`, `BlockNoteViewProps`
- `BlockNoteContext`, `useBlockNoteContext`, `BlockNoteContextValue`
- `useCreateBlockNote`, `useBlockNoteEditor`
- `useEditorChange`, `useEditorSelectionChange`, `usePrefersColorScheme`
- `PortalElementsMap`, `PortalTarget`

## Building UI

This package has no default UI. Each BlockNote menu and toolbar is a framework-neutral `@blocknote/core` extension that exposes a store. The store has `subscribe(listener)` and `state`, so Octane's own `useSyncExternalStore` can read it without any extra dependency.

### Menus and toolbars

```tsx
import { SuggestionMenu, filterSuggestionItems, getDefaultSlashMenuItems } from '@blocknote/core';
import { useBlockNoteEditor } from '@octanejs/blocknote';
import { useEffect, useSyncExternalStore } from 'octane';

export function SlashMenu() @{
	const editor = useBlockNoteEditor();
	const menu = editor.getExtension(SuggestionMenu)!;

	useEffect(() => {
		menu.addSuggestionMenu({ triggerCharacter: '/' });
		return () => menu.removeSuggestionMenu('/');
	}, [menu]);

	const state = useSyncExternalStore(menu.store.subscribe, () => menu.store.state);
	const items = state?.show
		? filterSuggestionItems(getDefaultSlashMenuItems(editor), state.query)
		: [];

	@if (state?.show) {
		<ul
			class="slash-menu"
			style={{ position: 'fixed', left: state.referencePos.left, top: state.referencePos.bottom }}
		>
			@for (const item of items; key item.key) {
				<li
					onMouseDown={(event: MouseEvent) => {
						event.preventDefault(); // keep focus in the editor
						menu.clearQuery();
						menu.closeMenu();
						item.onItemClick();
					}}
				>
					{item.title}
				</li>
			}
		</ul>
	}
}

// <BlockNoteViewRaw editor={editor}><SlashMenu /></BlockNoteViewRaw>
```

`FormattingToolbar`, `SideMenu`, `LinkToolbar`, `FilePanel`, and `TableHandles` follow the same pattern. For collision-aware placement, position the element from `referencePos` with a library such as `@octanejs/floating-ui`.

The extension stores are TanStack Stores. If your app already uses `@octanejs/tanstack-store`, `useStore(menu.store, (state) => state?.query)` also works and adds selector-based updates.

### Custom blocks

Core's `createBlockSpec` renders to DOM. To render an Octane component inside a block, mount a root on a node you own and unmount it in `destroy`:

```tsx
import { BlockNoteSchema, createBlockSpec, defaultBlockSpecs } from '@blocknote/core';
import { createRoot } from 'octane';

function CalloutIcon(props: { emoji: string }) @{
	<span class="callout-icon">{props.emoji}</span>
}

const Callout = createBlockSpec(
	{ type: 'callout', propSchema: { emoji: { default: '💡' } }, content: 'inline' },
	{
		render: (block) => {
			const dom = document.createElement('div');
			const icon = document.createElement('span');
			const contentDOM = document.createElement('div');
			dom.className = 'callout';
			icon.contentEditable = 'false';
			dom.append(icon, contentDOM);
			const root = createRoot(icon);
			root.render(CalloutIcon, { emoji: block.props.emoji });
			return { dom, contentDOM, destroy: () => root.unmount() };
		},
	},
);

export const schema = BlockNoteSchema.create({
	blockSpecs: { ...defaultBlockSpecs, callout: Callout() },
});

// useCreateBlockNote({ schema })
```

Each block root is separate from your app tree, so it does not see your contexts (theme, router, stores). Pass what it needs through props or module state. Context-aware block and inline content specs are planned.

Both recipes run as real-browser tests in `tests/browser/harness`.

## Server rendering

Server rendering is supported. The server emits the view shell, and the editor mounts into it on the client after hydration. Document content is not part of the server HTML. Without a `theme` prop the server renders the light scheme, and the system scheme applies after hydration. Pass `theme` to fix it on both sides.

## Known differences

- No default UI. `BlockNoteView`, `BlockNoteDefaultUI`, `ComponentsContext`, and the toolbar, menu, side-menu, table-handle, and comment components are not provided. Upstream disables all of them when no components context exists, so `BlockNoteViewRaw` here matches that upstream configuration.
- `BlockNoteViewRaw` does not accept the default UI flags (`formattingToolbar`, `slashMenu`, and so on). `portalElements` reads only `default`.
- Custom React block, inline content, and style specs are not provided.
- Event handlers receive native DOM events, as everywhere in Octane.

## Provenance

Independently authored and MIT licensed. See [UPSTREAM.md](./UPSTREAM.md).
