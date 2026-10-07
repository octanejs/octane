---
'@octanejs/alien-signals': minor
---

Port `react-alien-signals@0.4.0` over `alien-signals@3.2.1`.

New exports: `batch`, `trigger`, `useDeferredSignalValue`, `useSignalSelector`,
`useSignalPassiveEffect`, `useSignalLayoutEffect`, `useSignalInsertionEffect`,
and the `SignalSetter`, `SignalEffectCallback`, and `SignalEffectDependencies`
types. `createComputed` passes the previous value to its getter, and
`useSignalEffect` and `useSignalScope` accept an optional dependency list.
Components reading the same signal now share one core subscription.

Behavior follows upstream 0.4.0, including three changes for existing callers:

- `WritableSignal` is the core signal and takes a value. Pass updater
  functions to the setters from `useSignal` and `useSetSignal` instead of to
  the signal itself.
- `useSignalScope` returns a stable stop handle. It stops the running scope;
  calling it before commit does nothing, and a dependency change starts a new
  scope.
- The core dependency moves from `alien-signals` 1.0.4 to 3.2.1.
