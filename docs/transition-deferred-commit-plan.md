# Deferred transition commit: closing the shell tear

Last gap in [SUSPENSE_DIVERGENCE.md #4](../packages/octane/audit/SUSPENSE_DIVERGENCE.md):
content a synchronous transition patches OUTSIDE a suspended boundary still
updates early, so shell markup can run ahead of the held content it describes.
End state: a held synchronous transition behaves the way an async Action
already does — the committed screen stays whole, `isPending` turns on, and the
new values land in one step when the data arrives.

## The failed attempt, and the corrected diagnosis

The 2026-07-29 whole-drain attempt (documented in the divergence audit; the
code was reverted uncommitted) proved every piece except one: journal armed for
the whole drain, live effect/ref/store queues checkpointed and rewound, effect
dependency cells restored, the reveal replaying from the attempt's origin
block. The blocker: rolling the attempt back also reverted the bindings that
render `isPending`, turning the pending cue off. Fifteen transition tests
caught it, and the audit filed the prerequisite as "decouple the pending cue
from the transition render" — reversing `startTransition`'s deliberate
raise-priority-before-tick ordering.

That framing was wrong about the lever. The proof is already in the tree:
`AsyncActionKeepsCommittedState` renders `pending` while the parent selection
stays on its old value, in the SAME transition-tagged render. Priority never
separated the cue from the content there — **cell staging did**. During an
async Action, setters stage into a `TransitionActionBatch` without touching the
committed cell, so the one render sees old content and a true pending flag.
The cue's own storage (`slotRef.isPending` in the `useTransition` hook slot)
is flipped by `tickTransitionCount`'s listener pass and is not part of any
rollback surface: unwind an attempt and the flag still says true — only its
rendered output was reverted, and a re-render with old content cells
re-publishes exactly the cue-derived bindings (every other binding no-ops on
its bag guard).

So the prerequisite is not a scheduling change. It is extending the staging
that async Actions already use to the held-synchronous case.

## Verified mechanics (runtime.ts, current main)

- `stageTransitionValue` / `rebaseTransitionActionUpdate` /
  `flushTransitionActionBatch` (~930–1005): stage setter operations off the
  committed cell, rebase them across urgent writes to the same cell, and
  promote by writing cells + `scheduleRender`. `useState`/`useReducer` read
  through `stagedTransitionValue` (4725 / 4903 / 5135), so in-flight readers
  see the staged view.
- Synchronous transitions ALREADY stage: `startTransition` installs
  `ACTIVE_TRANSITION_ACTION_BATCH` around `fn()` and, for a non-thenable
  return, closes and flushes the batch before returning ("synchronous
  transitions flush their batch before returning"). The cells get their new
  values before the drain runs — which is what the attempt must revert on
  hold, and the batch's `baseValue` records exactly the value to revert to.
- The whole-drain attempt's other pieces were proven working in the reverted
  spike: attempt-wide journal window (the per-boundary journal, keyed-list
  parking and `forSlotParkable` all key off the same window and generalize
  unchanged), queue checkpoints for effects / effect events / refs / stores,
  and `snapshotSubtreeEffectDeps` restore.

## Design

On a hold while a synchronous transition's flush is in flight:

1. The attempt spans the whole drain: every transition-tagged block rendered
   in this flush is an origin. Unwind the attempt as the spike did — journal
   rollback (bindings, bags, controlled records, keyed structure via the
   existing parking machinery), queue rewind, effect-dep restore.
2. Revert the flushed cells to their `baseValue`s and re-stage the updates as
   an in-flight batch, so readers and later urgent writes see async-Action
   semantics.
3. Re-render the origin blocks at urgent priority. Cells are old and
   `slotRef.isPending` is true, so this writes only cue-derived bindings —
   everything else no-ops on its bag guard — and it cannot suspend, because
   old values render previously committed (cached) content. This is the cue
   re-publication that the spike was missing.
4. Resume = promotion: when the thenable settles, `flushTransitionActionBatch`
   writes the cells and schedules ordinary transition renders. Success commits
   the whole screen in one flush; a re-suspend loops back to (1). The
   boundary-side machinery (`transitionHeld`, entanglement, timeout fallback)
   keeps driving WHEN, unchanged.
5. `isPending=false` rides the promoted commit via `tickTransitionCount(-1)`,
   exactly as today.

**Urgent supersede is mode-dependent and both modes are pinned**: an urgent
write to a staged cell under an async Action REBASES
(`AsyncActionKeepsCommittedState`: the count rebases to 11); under a held
synchronous transition it DISCARDS the transition
(`UrgentSupersedesTransition`). The re-staged batch therefore carries a mode
flag; discard drops the batch, releases the hold, and lets the urgent render
through.

**Unchanged paths**: a transition that never suspends flushes and commits in
the same microtask flush as today (`TransitionBasics` pins `n` and `pending`
flipping in one commit) — the revert only runs on hold, so the common path
cost is zero. The per-boundary journal remains the sole cover for holds with
no flush in flight (the `useSuspenseQuery` urgent re-suspend shape).

## Acceptance

- The fifteen `transitions.test.ts` cases the spike broke, green.
- A resurrected `TransitionOutsideBoundary` test: shell text and its effect
  hold with the boundary, no aborted-attempt effect leak, shell and content
  arrive together.
- `benchmarks/async-composition` guard stays at 0 mixed states; after the fix
  lands, move the board (or a sibling copy) OUTSIDE the boundary and pin that
  at 0 too — the benchmark-level proof the shell tear is closed.
- `UrgentSupersedesTransition`, the async-Action suite, and
  `transition-held-audit.test.ts` unchanged.

## Phases

- **P0 (this PR)**: plan + correct the divergence audit's "decouple the cue"
  prerequisite.
- **P1**: attempt-wide window + queue checkpoints + cell revert/re-stage +
  urgent cue re-render. Closes the shell binding/effect tear.
- **P2**: resume-as-promotion; retire `commitResumeInner`'s replay-from-origin
  in favor of the batch, where the boundary machinery allows.
- **P3**: supersede matrix (urgent discard, nested `startTransition`, multiple
  origins in one flush, `flushSync` interleaving, an async Action and a held
  sync transition in flight together).
- **P4**: benchmark board outside the boundary; close the divergence entry.

## Risks / open questions

- Multiple origins whose renders interleave with urgent work in one drain:
  the attempt must not capture urgent renders (the spike's `journalSkipsUrgent`
  probe was the wrong tool; with staging, urgent renders of origin blocks see
  old cells anyway, which needs a test rather than an assumption).
- `useOptimistic` deliberately bypasses the batch (optimistic values stay
  visible); the revert must not swallow optimistic state.
- Devtools/profiler hooks observe `scheduleRender` reasons; promotion
  introduces a second schedule for the same logical update.
