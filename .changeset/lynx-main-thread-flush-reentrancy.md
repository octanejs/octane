---
'@octanejs/lynx': patch
---

Keep a `'main thread'` handler's `__FlushElementTree()` working on Lynx for Web.

The documented Lynx main-thread scripting pattern is to write element styles in a
`'main thread'` handler and publish them with `__FlushElementTree()`. On Lynx for
Web that flush threw `recursive use of an object detected which would lead to
unsafe aliasing in rust` on every event, and because the throw escaped through
the host's own frames it surfaced as an uncaught page error rather than anything
the application could catch. A handler bound to a per-frame event — a
`main-thread:bindscroll` on an auto-scrolling `<list>`, say — produced hundreds
of them in seconds.

The cause is in `@lynx-js/web-core`, not in Octane: its wasm element context is
still borrowed by `common_event_handler` when that calls `runWorklet`, so the
`__FlushElementTree` it installed rejects the re-entrant call. Replacing Octane's
`runWorklet` with a bare `() => __FlushElementTree()` reproduces it exactly, on
both 0.22.2 and the current 0.23.1, so nothing about the framework on top
changes the outcome.

Octane owns the seam that runs the handler, so the main-thread runtime now takes
the flush where such a host can accept it: the inline call is still attempted
first, and only a host that rejects one moves that flush to the end of the
dispatch, coalescing repeated requests into a single publish. Hosts that permit a
re-entrant flush — every native Lynx runtime — keep their existing synchronous
timing, and the element writes themselves were never affected.
