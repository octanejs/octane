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

## P1 implementation findings (2026-07-30 attempt — reverted, unlanded)

A full P1 implementation was built and reverted twice. Everything below is
verified against real code and stays true for the next attempt.

**What worked unconditionally** (both designs, all green): the whole-drain
attempt with queue checkpoints, cell revert + urgent cue re-render (the
`isPending` storage survives and only cue bindings write — the plan's core
mechanism is sound), the release-gate on the boundary's in-place success
(`heldSyncCellsIntact` — without it the cue re-render's old-content success
releases the hold and kills the transition), and hold re-entry across rounds.
The shell test held, effects did not leak, the flip-away case improved from a
tear to a whole held screen.

**Design A — resume replaced by promotion** (cells written forward at the
staged-reveal barrier, ordinary transition drain re-renders): reached 132
targeted tests green, full 16,314-suite green, zero mixed states, but the
promoted drain re-created every warm-walk fetch each round —
`update_calls` 17 vs the pinned 8 — because warm caches are EPISODE-scoped and
a fresh drain cannot adopt them. Episode-resume attempts (RESUME_REPLAY wrap,
one-shot flag, hold-time capture) each failed differently: the cue re-render
both mints a new episode and re-registers warm plans over old props, so any
whole-flush replay flag poisons later rounds (observed: v0 requests fired
mid-v1 operation). Promotion needs `puSwaps` (hook-entry undo/redo — built,
works, covers `useMemo`/`puPub`/`puAdopt`; prod inline bag caches are covered
by the bag journal + a redo pass that was also built) and something
episode-agnostic for warm-created values.

**Design B — ride the existing resume replay** (forward-apply cells at the
barrier, let `commitResumeInner` replay): the replay renders through the
compiled env tuples the CUE re-render captured with old values, so standalone
`startTransition` fixtures commit stale content — `useTransition` fixtures are
rescued only by their listener re-render. The fix is an origin re-render after
the last holder reveals (inline, before `commitEffects`), plus a warm HARVEST
carried on the hold (episode-agnostic adoption; built as an `adoptWarmValue`
fallback with per-round `taken` reset). This design ended at 11 failing tests
with effect-ordering signatures that did not respond to refresh placement —
the attempt-side hold path itself had regressed (attempt-render logs missing
from the flip test), root cause not yet identified. Reverted rather than
converged blind.

**Hard-won specifics for the next session**: the flushed batch must be
retained per-group for the drain (`flushTransitionActionBatch` clears it);
promotion/forward-apply must re-retain what it applies or round 2 cannot
revert; `swapToPendingFallback` must bring cells forward when the timeout
fires; urgent supersede stays DISCARD for sync (gate on
`Object.is(slot.value, baseValue)`); the per-boundary journal must NOT get pu
journaling (per-boundary replay behavior is pinned — attempt-scoped only); and
the ORIGIN's `__warmEpisode` is clobbered by the cue re-render, so any episode
capture must happen inside the suspending render (`handleSuspense`), not at
attempt end. A pre-existing sole-child hole array→text→array crash blocks the
cue re-render's kind round-trips and is spun out separately with a ready
failing test.

## P1 landed (2026-07-30, Design A + harvest)

Design A shipped in this PR: whole-drain attempt, cell revert, urgent cue
re-render, `heldSyncCellsIntact` release gate, promotion at the staged-reveal
barrier, promote-at-timeout, sync urgent-supersede discard, pu-entry swaps
(`useMemo`/`puPub`/`puAdopt`), and the episode-agnostic warm harvest collected
from the origin subtree's block caches at unwind. Continuing rounds (a promoted
render suspending on a later dependency) skip the pu undo and the cue
re-render — the screen and cue were re-established in round one — so entries
move monotonically forward. The flip-away case now re-asserts the whole held
screen instead of tearing to the flipped text.

## P2 warm-resource reuse landed (2026-08-10)

The original promoted transition still recreated five already-warmed resources
when its second round discovered the dependent `owner` request, before that
request resolved. The application's cache avoided duplicate network requests,
but the async-composition benchmark recorded 13 resource-creator calls instead
of the eight actual requests.

The first held attempt already harvests warmed values outside the per-episode
cache, and real memo adoption already consumes those values exactly once.
Speculative warming now consults the same held or promoted harvest after its
ordinary cache and active-memo checks. A matching slot and dependencies claim
only the existing occurrence for the current warm plan; even an already-adopted
entry remains an occurrence tombstone and must not restart its creator.

This lookup neither consumes the harvested value nor publishes another cache
entry. Real memo adoption remains the sole owner of `taken`, repeated matching
occurrences stay distinct, and the existing promotion, rollback, supersession,
and cleanup paths retain harvest ownership. No new state, allocation, runtime
API, or ordinary render-path work is introduced. The production benchmark now
requires exactly eight initial and eight transition-update creators, two
request waves, eight actual requests, and zero mixed-version committed states.

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
