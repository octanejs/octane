---
'octane': patch
---

Release an idle streamed-signal upstream as soon as its response is abandoned.

`createStreamedSignalResultFrames` ran as an async generator that awaited the
upstream iterator's `next()`. Cancelling the generator queued its `return()`
behind that pending read, so an idle but open source such as an LLM token
stream, WebSocket, or SSE feed was only returned once it produced another
value. A client disconnect, request abort, or inactivity timeout could leave
it open indefinitely. Every producer wait is now interruptible. The consumer's
`return()` and the request signal settle the pending wait immediately, and the
upstream's `return()` runs then. Backpressure, the inactivity-timeout rules,
and the result frame grammar are unchanged.

Automatic streamed signals now degrade per channel at the 256-live-channel
budget. Previously the 257th concurrently live attempt failed the entire
multiplexer and threw away every in-flight result. Now only the overflowing
attempt is refused: it is neither streamed nor announced, so the browser loads
it itself.
