---
'@octanejs/tanstack-table': patch
---

Build atom options only when table-core supplies a comparator.

The reactivity bindings forwarded `{ compare: options?.compare }` into
`createAtom` for every atom, including the ones table-core creates without a
comparator. `AtomOptions.compare` is declared optional without `undefined`, so
that object is not an `AtomOptions` under `exactOptionalPropertyTypes`, and the
error is worse than it looks: the failure knocks out the second `createAtom`
overload, so `createWritableAtom` was reported as returning a `ReadonlyAtom`
that does not satisfy the `TableReactivityBindings` contract.

This package publishes `src/`, so those are the consumer's compiler options.
An application with the flag on could not build it. The options object is now
constructed only when there is a comparator to put in it. `createAtom` reads
`options?.compare ?? Object.is`, so an omitted object and one holding
`undefined` produce the same atom.
