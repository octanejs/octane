---
'octane': patch
---

Ship less signal code to the browser. Client bundles that read signals no longer
carry the server's seed serialization, which only the server's native read
collector installs: about 2.1 kB raw and 0.5 kB gzip. Behavior is unchanged.
