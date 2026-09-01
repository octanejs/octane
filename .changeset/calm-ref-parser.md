---
'octane': patch
---

Preserve element and fragment ref ownership when a suspended root rolls back, so retries detach the previous ref and attach only the committed replacement. Keep native parsing first while accepting valid TSRX syntax supported by the JavaScript parser, without hiding operational failures or malformed input. Update TSRX core to 0.1.63 and adopt its released computed-key source mapping fix.
