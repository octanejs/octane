---
'octane': patch
---

Ship less client runtime in applications that never use effects, refs, Effect Events, Activity, Suspense hides, controlled selects, transitions, signals or hydration. Their commit phases, offscreen capture transfer, renderer signal-owner bookkeeping, event authority and native-read batches now install from the APIs that create that work. The js-framework benchmark ships about 2.2 KB less gzip and chat-stream about 2.1 KB less, with the same render work.
