---
'octane': patch
---

A universal renderer module that reads signals and renders a child component no longer imports DOM client helpers into its warm plan. The warm plan used `beginNativeReadWitness`, `finishNativeReadWitness`, and `nativeWarmMemo` from `octane/internal/client`, which pulled the DOM runtime into non-DOM bundles; it now uses the universal `warmChild` and `warmMemo` without the DOM read witness, since the universal core tracks reads while the owner renders.
