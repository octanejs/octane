---
'octane': patch
---

Stage native signal writes made in transitions until their affected renderer and renderer-free presentations are ready. Keep committed values and public notifications unchanged while a query or derived result is pending, preserve urgent edits, and transfer accepted producer and binding subscriptions without restarting them. Reuse the existing transition journals and optional visibility driver for pending cues, timeout fallbacks, and cleanup.
