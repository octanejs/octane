---
'octane': patch
---

A transition-held Suspense/`@try` boundary now keeps the previously committed
content across URGENT (async) re-suspensions of that still-committed content,
instead of flashing the `@pending` fallback — matching React's `useTransition`
contract that, once prior content is showing, it stays on screen until the new
tree is ready.

Previously the hold only fired while the re-suspending render was at transition
priority. But a held boundary's content can re-suspend at urgent priority — e.g.
`@octanejs/query`'s `useSuspenseQuery` observer notifies on a `setTimeout(0)`
macrotask, AFTER octane's transition window has closed, so the re-render (and its
re-suspend on the new in-flight fetch) is urgent. `handleSuspense` then took the
softDetach + fallback path and the fallback flashed. It now continues the hold
when the boundary is already transition-held (`hasResolved`, success arm live and
intact), tracks the new thenable via the existing resume path, and re-arms the
transition-fallback timeout against it. A fresh urgent suspend with no prior
committed content still shows the fallback (React parity for urgent suspense).
