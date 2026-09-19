---
'octane': patch
---

Move native signal transition coordination behind the signals model capability so ordinary client applications no longer retain its preparation, retry, and publication policy. Preserve signals imported after an async Action awaits and atomic updates to consumers that receive signal handles through props.

The model entry now retains this coordinator, increasing standalone signals and signal-using SSR bundle sizes.
