---
'octane': patch
---

Stop the compiled `@for` path from retaining the entire descriptor renderer.

`mountItem` decided whether a de-opt list's items render through the plain
`deoptItemBody` by comparing the body function by identity. The comparison is
correct and cheap at runtime, but `mountItem` sits on the compiled `@for` mount
path that every list-rendering application reaches, so naming `deoptItemBody`
from it is a live reference a bundler must honour. Retaining `deoptItemBody`
retains `childSlot` — the universal renderable-hole dispatcher — and through it
the descriptor renderer, `FragmentInstance` and fragment refs, portals,
transitions, controlled-form restoration, focus preservation and the DOM
attribute tables. Applications that only ever render compiled templates, and
never present a generic renderable hole, shipped all of it.

The fact is now recorded on the `ForSlot` as `plainDeopt`, next to the existing
`mappedNative` flag, and stamped by `childSlot` where the body is chosen —
inside the graph that already retains those modules. `mountItem` reads the flag
instead of naming the function. The recorded value is exactly the identity test
it replaces: within the de-opt branch the body is `deoptItemBody` precisely when
the compiler supplied no map body and this is not the mapped fallback, because
both body-wrapping assignments are guarded by those same two conditions. Both
`ForSlot` literals declare the field, so every slot keeps one hidden class and
the stamp transitions nothing.

Normalized production builds, gzip, via `benchmarks/bundle-size`:

| application | before | after |
| --- | ---: | ---: |
| js-framework rows | 40,752 | **20,609** |
| TodoMVC | 41,293 | **21,835** |
| chat-stream | 41,530 | **21,968** |
| weather-app | 49,524 | **31,742** |

The saving is entirely in the framework chunk (rows 38,380 → 18,237 B); every
application chunk is unchanged, because no compiler output changed. The rows
bundle drops from 559 surviving top-level declarations to 340 — `childSlot`,
`FragmentInstance`, `deoptItemBody`, `renderPortalState`, `startTransition` and
`setAttribute` all become unreachable, while `reconcileKeyed` and `mountItem`
correctly remain. The `octane-tsrx` application, framework, and total budgets in
`bundle-size/app-budgets.json`, and the reachability ceilings in
`bundle-size/minimal-budgets.json`, are re-recorded against the new floor.

This restores the reachability that held before the identity tests were
introduced; the compiled output and every rendering path are unchanged.
