---
'@octanejs/mobx': patch
---

`mobx` is now a peer dependency (`^6.16.1`), as it is for `mobx-react-lite`, so the binding re-exports and observes the application's MobX. Before, an app on another MobX release got the binding's pinned 6.16.1 as well, and identity checks such as `isObservable` and `toJS` from one copy did not recognize observables made by the other. Install `mobx` next to `@octanejs/mobx` if your app does not already have it.
