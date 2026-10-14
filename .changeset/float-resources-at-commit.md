---
'octane': patch
---

Float resources and resource hints a render requests now reach `document.head`
at that render's commit instead of while it renders. This covers
`<link rel="stylesheet" precedence>`, `<style href precedence>`,
`<script async src>`, and `preload`, `preinit`, `preinitModule`,
`preloadModule`, `preconnect` and `prefetchDNS` calls made during a render.
They insert in render order, so deduplication, preload options carried onto a
later `preinit`, and precedence-group order are unchanged, and a render that
never commits, such as a transition that suspends, inserts nothing. A resource
option whose name the DOM rejects as an attribute is now skipped rather than
thrown.
