---
'octane': patch
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
---

Authored `<title>`/`<meta>`/`<link>` now reach the real `<head>` in file-routed
SSR apps. The route renders into the template's `<div id="root">`, not a
document, so core's head fold had no `</head>` to target and prepended the
metadata inside `#root` instead: the template's `<title>` won by document order,
`link rel="canonical"` and `meta name="description"` were ignored where they
landed, and hydration could not find the ownership markers in `document.head` so
it appended duplicates.

New opt-in `RenderOptions.headChannel: 'separate'` withholds hoisted metadata
from `html`/the streamed shell and hands it over on its own, through
`RenderResult.head` for the buffered renderers and the new
`StreamOptions.onHeadReady(head)` for the streaming ones (called before the shell
is written, so a host can still place it in the template prefix). Both the dev
server and the production handler use it and splice at `<!--ssr-head-->`.

The default stays `'fold'` and is unchanged: same bytes, same result shape, no
`head` field. Core does not dedupe metadata, so a `<title>` in `index.html` and
one in a component both still ship.
