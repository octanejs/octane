---
'@octanejs/lynx': patch
---

Build the Lynx first-tree description after the first paint instead of before
it.

Capturing the first tree runs after the page is already published to the host,
so everything it does sits between the tree reaching the DOM and the browser
painting it. Turning the captured tree into the clone-safe description the
background clones when it adopts is pure allocation over an already-validated
result, and nothing before adoption reads it — so it now happens on first read
rather than during capture.

Validation and the native-ID read stay eager: a host that cannot be captured
still faults the synchronous first screen while its caller holds the source to
retry cleanup against, and `firstScreenSnapshot()` still answers while unmount
cleanup retries.

On the `lynx-table` 10,000-row first screen this takes the post-publication
window from a 217 ms median to 163 ms (paired A/B, n=8, every pair improved),
and FCP@10k from 1,576 ms to 1,483 ms.
