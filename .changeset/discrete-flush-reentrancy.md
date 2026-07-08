---
'octane': patch
---

Fixed a commit-phase crash ("Failed to execute 'removeChild' on 'Node'…") when a route swap or conditional removes the focused element: Chrome fires `blur`/`focusout` synchronously inside `removeChild`, and blur is a discrete event, so the end-of-dispatch flush re-entered the scheduler mid-commit — draining queued renders and effects while the outer removal walk held cached sibling pointers. A flush now tracks that it is on the stack (`inFlush`); a `flushSync` landing during it (including the internal discrete-event flush) runs its callback and defers the drain to the ambient flush, matching React's "cannot flush when already rendering" rule. `flushSync` nested inside another `flushSync`'s *callback* still flushes inline.
