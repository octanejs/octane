---
'@octanejs/tanstack-virtual': patch
---

Update to `@tanstack/virtual-core` 3.19.11 and port the `@tanstack/react-virtual` 3.14.26 adapter. A user scroll now retires a pending instant scroll command, so a reader who scrolls up before the initial `scrollToEnd()` reconciles is no longer pulled back to the old end after an append. Direct DOM updates also position rows that mount without re-rendering the virtualizer's owner.
