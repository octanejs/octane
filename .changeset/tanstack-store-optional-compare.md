---
'@octanejs/tanstack-store': patch
---

Let `UseSelectorOptions.compare` hold `undefined` explicitly.

This package publishes `src/`, so the consumer's compiler options are the ones
that compile it. An application with `exactOptionalPropertyTypes` enabled could
not build it at all: `useStore` normalises its variadic arguments into
`{ compare }`, where `compare` is the optional third argument, and passing that
object to `useSelector` failed because the target property was declared without
`undefined`.

The same wall met anyone forwarding their own optional comparator, because
`{ compare: maybeCompare }` is not assignable to `{ compare?: Compare }` under
that flag. Declaring the property as `compare?: Compare | undefined` accepts
both. The runtime is unchanged: `useSelector` has always read the option with
`options?.compare ?? defaultCompare`, so an absent key and an explicit
`undefined` already behaved identically.
