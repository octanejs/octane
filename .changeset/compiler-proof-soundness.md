---
'octane': patch
---

Close four compiler soundness gaps in inferred proofs and generated code.

- Builtin text-conversion proofs (`{String(x) as string}` and primitive locals)
  now share one mutation check. A replacement of `String`, `Number`, `BigInt`,
  or `Date` reached through a `let` alias, a parameter, `globalThis.globalThis`,
  or a returned global object no longer keeps the builtin proof, so SSR renders
  the live value instead of throwing. Computed reads and application `.set()`
  calls on ordinary receivers no longer decline primitive-local proofs.
- Independent `<Hydrate>` boundaries reject captures initialized by
  destructuring or parameter defaults (`const { value = useRef(null) } = props`)
  and by function or class declarations with
  `OCTANE_HYDRATE_INDEPENDENT_OWNER_CAPTURE`, instead of serializing them as
  JSON.
- Automatic `use()` creation dependencies no longer read ambient globals that
  appear only inside callbacks or behind guards the compiler cannot replay
  (`try`/`catch`, `switch (typeof x)`, `'x' in globalThis`, `??`). Nullable
  locals read in those positions become optional reads (`value?.prop`). A
  non-arrow callback's `arguments` no longer becomes a component dependency.
- Generated source origins are applied copy-on-write everywhere, so a scoped
  `<style>` inside a reverse renderer region (`<Html>` in an object scene)
  compiles the same way whether or not parser ASTs are frozen.
