# Pagecraft

Pagecraft is a product-shaped document workspace built in `.tsrx` with the real
`@octanejs/lexical` binding. Its documents load and save through a deterministic
same-origin Node server, so selection, history, autosave races, and recovery are
exercised at the same browser boundaries a production editor uses.

## Run it

From this directory:

```bash
pnpm dev
```

Open `http://127.0.0.1:5226/documents/launch-brief`. The server runs Vite as
middleware during development and serves the same `/api/documents` contract used
by the production fixture.

The maintained gates are:

```bash
pnpm typecheck
pnpm build
pnpm test:e2e
```

`test:e2e` drives all five journeys against the built client, then repeats them
against a fresh Vite development cache. The cold pass pins Lexical core identity
across dependency-optimizer restarts as well as normal application behavior.

## Observable Octane and Lexical evidence

- `LexicalComposer`, `RichTextPlugin`, `ContentEditable`, `HistoryPlugin`,
  `ListPlugin`, and `OnChangePlugin` all come from `@octanejs/lexical`; the app
  does not wrap a textarea or mirror content into a second editing surface.
- Toolbar actions operate on the browser's live contenteditable selection. A
  pointer interaction preserves that selection and keyboard focus while Lexical
  formats the selected text.
- Undo and redo change the rendered rich-text tree, and the resulting serialized
  `EditorState` survives a server round trip and reload.
- Every edit enters a visible debounced autosave lifecycle. Each mutation carries
  a monotonic document version owned above the route-mounted editor, so immediate
  navigation cannot drop a timer or reset a version. A deliberately slow older
  response cannot replace or misreport a newer draft.
- Serialized editor state is parsed by Lexical before it crosses either side of
  the persistence boundary. Unknown nodes are rejected without replacing the
  currently usable document or surfacing an uncaught browser error.
- Deep-linked documents remount their editor by key while the surrounding keyed
  navigation preserves focus. Loading, blank, missing, offline, and retry states
  are distinct and accessible.

## Five Playwright journeys

1. Open a document URL at a mobile viewport, navigate by keyboard, retain focus,
   immediately switch away and back, and prove the debounced draft was flushed.
2. Format a live selection, undo and redo the visible result, wait for autosave,
   and prove the rich text survives reload.
3. Start a slow save, switch away and remount the editor, make a newer edit, then
   prove the remount keeps version ownership and the older completion is harmless.
4. Retry a rejected autosave, edit while Chromium is offline, reconnect, and
   verify that the retained local draft is persisted.
5. Recover a deterministic load failure by keyboard, reject corrupt save and load
   payloads, open a genuine blank document, and enter a missing SPA route without
   ever leaking the previous editor.

Every journey installs the shared browser diagnostic collector before navigation
and fails on uncaught page errors or unexpected console errors.
