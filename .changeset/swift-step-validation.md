---
'@octanejs/usehooks-ts': patch
---

Validate useStep setStep calls synchronously before scheduling state updates, including updater results and NaN, while retaining earlier accepted actions from the same turn.
