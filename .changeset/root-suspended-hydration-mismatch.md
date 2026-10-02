---
'octane': patch
---

A root without a Suspense boundary that suspends while hydrating now reports a
hydration mismatch once. When its first attempt had already rebuilt mismatched
content, that attempt's diagnostics were published even though it was
discarded, and the retry reported the same mismatch again, so development logged
the warning twice and `onRecoverableError` fired twice. Some recoveries, such
as a renderable or only-child hole over server text, or a list the server
rendered differently, also left a half-built client subtree in place of the
server content while the root was pending. A suspended root attempt now leaves
the server content as the server rendered it, and its mismatch diagnostics and
`onRecoverableError` reports are published only by the attempt that commits.
