---
'octane': patch
---

Compiled component bodies in modules that import `octane/signals` no longer wrap every render in a native-read bracket. The renderer already collects each body's reads, including reads made through helper calls, so the bracket only rejoined that collection. Signal-enabled modules compile smaller and hydrate slightly faster; their behavior is unchanged.
