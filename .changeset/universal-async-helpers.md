---
'octane': patch
---

Let universal-renderer modules declare `async` and generator functions that JSX
never mounts. The universal compiler's synchronous-body restriction now applies
only once a function is actually compiled as a component — the `@{ … }` form, a
JSX-shaped return, or component usage — so a plain async helper in a `.tsrx`
file no longer fails the native-renderer build.
