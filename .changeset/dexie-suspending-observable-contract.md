---
'@octanejs/dexie': patch
---

Align `useSuspendingObservable` inputs with Dexie's observer-based `Subscribable<T>` contract. Accept observer sources and factories in public types and reject callback subscriptions that previously typechecked but failed at runtime. Callback subscriptions remain supported by `useObservable`.
