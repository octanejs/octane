---
octane: patch
---

Treat closures marked with an other-context directive as opaque to dependency
inference (#542, problem 2).

A nested function whose directive prologue declares that its body executes
outside render — `'use gpu'` (TypeGPU shader code) or `'worklet'`
(Reanimated/worklets-core UI-thread code) — now contributes only its root
captures to an inferred dependency array. Previously the array hoisted the
closure's member reads to render time, which evaluated context-bound getters
such as TypeGPU's `.$` where they are illegal, forcing an explicit dependency
array. The TypeGPU example from the issue now infers `[root, timeUniform,
hueUniform]` with no array written.

The directive list is a deliberate allowlist and can grow. Same-context hints
(`'use strict'`, React Compiler's `'use memo'`/`'use no memo'`) and directives
reserved for other semantics (`'use server'`, `'use client'`, `'use cache'`,
`'use workflow'`) never truncate; closures without a listed directive keep
today's member-path inference.
