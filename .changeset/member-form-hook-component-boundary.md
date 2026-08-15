---
'octane': patch
---

Give a component that calls a method-style custom hook its own update boundary.

A component that calls a hook owns that hook's state, so an update the hook
schedules re-renders that component and nothing else. That held for
`useThing()` but not for `obj.useThing()` — and the object-carried shape is how
a large part of the React ecosystem exposes hooks: `route.useLoaderData()`,
`api.useGetThingQuery()`, and every hook returned by a `createXContext()`
factory.

The `componentSlotLite` eligibility pre-pass decides whether a same-module
component is hookless. Its body walk rejected a component on an unknown call
only when the callee was an `Identifier`, and the free-identifier sweep ahead of
it only ever sees bare names, so neither test could observe `api.useCounter()`:
the receiver is `api`, and the callee is a `MemberExpression`. A component whose
only hook was member-form was therefore classified hookless and mounted through
`componentSlotLite`, a `LiteBlockImpl` with no block of its own. Its hook cells
and their `forceUpdate` belonged to the parent, so updating that hook re-rendered
the parent and every sibling under it, and the component could never bail out of
a render it should have been isolated from.

The slot-injection pass already handles these calls — it wraps them as
`withSlot(sym, () => obj.useX(...args, sym))` precisely because they are hooks —
so the two passes disagreed about the same syntax. The eligibility walk now
applies the same `use[A-Z]` convention to the property name, and fails closed:
matching only forfeits the lite path, never correctness.

Components that genuinely have no hooks keep `componentSlotLite` exactly as
before. The `benchmarks/codegen-size` corpus compiles byte-identically (raw
152564, min 75164, gz 26774 before and after), and compile time over 200
repetitions is unchanged within measurement noise (baseline 359.3-366.3 ms,
candidate 362.2-372.0 ms across interleaved best-of-7 runs). Where the fix does
apply, one `componentSlotLite` call becomes a `componentSlotVoid` call — on the
regression fixture, +28 bytes of emitted output for the component that gains a
real block.
