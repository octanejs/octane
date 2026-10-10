# Scheduling: microtasks, tasks, and megatasks

Cite symbols, not line numbers: `runtime.ts` moves daily. Issue
[#1864](https://github.com/octanejs/octane/issues/1864) owns changes to the
scheduling contract; read its latest decisions before touching any of this.

## The event loop, as it applies here

- A task runs to completion. The microtask checkpoint that follows drains every
  microtask, **including microtasks queued during the drain**. Only then can the
  browser run rendering steps (rAF callbacks, style, layout, paint) or start the
  next task, such as input, timers, or network callbacks.
- So `queueMicrotask`, `Promise.resolve().then`, `await` of an already-settled
  value, and `MutationObserver` callbacks all share one checkpoint. Nothing paints
  and no input is delivered between them. **They are not yields.**
- `requestAnimationFrame` runs before the next paint and never runs in a
  background tab. **It is not a yield either.**
- Only a posted task yields: `scheduler.postTask`, then `MessageChannel`, then
  `setTimeout`. Background tabs clamp `setTimeout` to at least 1 s, and Chrome
  throttles chained timers much further after a tab stays hidden. Nested
  timers are clamped to 4 ms. `MessageChannel` is not throttled that way.

## How Octane schedules today

The contract is `docs/differences-from-react.md`, §Scheduler: urgent renders are microtask-batched; transitions, deferred swaps, and ready
producer admission use host tasks. All renders run to completion, with no time-slicing.

- `scheduleRender` routes urgent work to `QUEUE` and queued transition/producer
  work to the host-task admission queue. Ordinary urgent updates arm one
  `queueMicrotask(flush)` for a synchronous burst; a posted task admits the
  waiting work. `flushSync` and `act()` drain both priorities.
- `flush` calls `flushWork`. `drainQueue` renders ancestors before descendants,
  so a parent's render absorbs queued descendants, and then the root commits.
  `commitEffects` runs insertion and layout work synchronously, then hands
  passive effects to `schedulePostPaint` through `schedulePassiveFlush`.
- `drainPassivesBeforeRender` runs pending passive effects before the next
  render, as React does at the start of its commit.

## The megatask hazard (#1864)

Before the fixes in #1864, the flush microtask ran before the next asynchronous
value arrived. A producer publishing one value per microtask hop paid for a full
render, commit, and early drain of the previous commit's passive effects at every
hop, all inside one checkpoint. Historical pre-fix measurements (not current behavior):

- 100 ready stream values, or 100 action dispatches: 101 Octane commits against
  2 in React 19.2.7. A task armed before the burst ran after all of them.
- `useDeferredValue`'s stale and deferred commits share one checkpoint. In
  Chromium that cost 40–80 ms keystroke-to-paint, against under 16 ms in React.
- The nested-update guard cannot see this. `scheduleRender` starts a new update
  chain for every update scheduled with `CURRENT_BLOCK === null`, so a burst of
  hops never accumulates a count.

## Rules for new code

1. **No render or commit per hop.** A producer (stream pull, async iterator,
   action queue, signal publication, island activation) must not request a
   render for each value and then continue on a microtask. Publish what is
   ready, then request one render.
2. **No chained ready continuations that each do framework work.** For example,
   `.then(() => { publish(); next(); })` where `publish` renders, or
   `queueMicrotask(next)` after a commit.
3. **Coalesce first, then yield.** Latest-wins state collapses to one render.
   Only if the remaining work can still be unbounded, yield by posting a task.
   Yielding without coalescing turns one 100 ms block into 100 tasks that each
   render and commit: latency improves and total work stays the same or grows.
4. **One shared budget, not one per producer.** A per-producer budget resets for
   every producer, so N producers still make a megatask.
5. **Reuse `postHostTask`; do not add a poster.** `host-task.ts` selects
   `scheduler.postTask`, then a fresh `MessageChannel`, then `setTimeout`.
   Deferred swaps, transition/producer admission, the shared elapsed budget,
   island activation, and resize delivery use it. Post-paint scheduling and
   test checkpoints have distinct observation requirements; preserve those.

6. **Never depend on rAF for progress.** Pair it with a bounded timer, as
   `schedulePostPaint` does.
7. **Preserve the documented timing contract.** An urgent `setState(); await 0`
   can observe the commit. Transition and deferred work waits for a task.
   Pending cues expose committed values first, subject to the documented hold,
   native-signal and synchronous-drain exceptions. New changes need a contract
   update and the evidence below; do not infer React behavior from surface syntax.

## Evidence for a scheduling change

### Commit count before a marker task

Microtask and task ordering is the same on every host, so jsdom shows it
deterministically. Arm a task before the burst, record each commit, and count the
commits that precede the task:

```ts
function armTaskMarker(log: string[]): void {
	const channel = new MessageChannel();
	channel.port1.onmessage = () => {
		channel.port1.close();
		log.push('<task>');
	};
	channel.port2.postMessage(null);
}

// Probe component: useLayoutEffect(() => { log.push(`commit:${value}`); }, null);
armTaskMarker(log);
// ...start the burst: 100 ready values, dispatches, or a deferred update...
await vi.waitFor(() => expect(log).toContain('<task>'));
const before = log.slice(0, log.indexOf('<task>'));
expect(before.filter((entry) => entry.startsWith('commit:'))).toHaveLength(1);
```

For a deferred update, assert that the marker lands between the urgent and the
deferred commit. Commit counts are optimization claims under
`.rulesync/rules/testing.md`: keep them in a benchmark with a ratio guard until
#1864 documents a commit-count guarantee. After that, a correctness test may
assert the guarantee.

### User-visible latency in a real browser

Use Event Timing, not long-task entries. Install
`new PerformanceObserver(cb).observe({ type: 'event', durationThreshold: 16, buffered: true })`
before the app loads, drive trusted input with Playwright, and take the maximum
duration per `interactionId` (INP-style keystroke-to-paint). Run it in Chromium
through `packages/octane/tests/browser/` (the `octane-events-browser` project),
with CPU throttling through CDP `Emulation.setCPUThrottlingRate`, and compare
against the same app built with React.

### Suites

`node benchmarks/bench.mjs --quick <suite>`, one suite at a time:

- `scheduler-responsiveness`: input-to-completion latency, p95 and p99, and
  frame gaps under 6× CPU throttling;
- `passive-scheduling` and `effect-scheduling`: post-paint callback work;
- `chat-stream` and `conversation-streaming`: streamed updates.

## Native producer admission and shared pacing

Ready query and asynchronous derived publications use the existing native graph
batch boundary to mark their publication context. Native component reads keep
their existing render priority while joining the existing host-task queue.
Subscriptions, graph effects, and direct signal bindings still run for every
publication; plain signal writes and native event or layout updates retain urgent
admission. An urgent update to a queued component upgrades its admission;
an ordinary unrelated urgent microtask flush does not consume its waiting
producer refresh. Controlled restoration can drain both queues, and an urgent
ancestor can absorb a queued descendant.

Query promise results and query/derived streams share `yieldForHostBudget` from
`host-budget.ts`. Successful one-shot results check it before publication;
retained-value/seed reads and rejection delivery keep their existing paths. Check
it before a pull and before processing a ready result: checking only the next
pull leaves a concurrent batch of already-ready results unbounded. Re-enter the
producer lease guard after waking, and preserve observation acknowledgements
before requesting another value. The approximately 5 ms window is shared across
producers and reset by a host task, not by each value or owner. It cannot interrupt
an expensive iterator, subscriber, render, or commit. A cold I/O wait lets the
sentinel run without adding another timer to each result.

Even one successful query can wait if earlier work spent the shared window;
synchronous SSR immediately after promise resolution may still see pending.
Awaited `act()` includes the pending budget sentinel in both of its async drains.
Rejections retain prompt failure notification and cleanup, so rejection bursts
remain outside the successful-publication pacing guarantee.

`benchmarks/scheduler-responsiveness/signal-backlog.mjs` records ordered source
publications, component commits, marker latency, and total completion for ready
and CPU-heavy streams. Direct binding writes are outside its component commit
count. Use Chromium Event Timing for input-to-paint claims.

## Direct buffered transport readers

Direct streamed RPC and optional renderer-response readers share one approximately
5 ms host budget. Check reader retirement before every retry, including after a
ready transport result. RPC `return()` retires a pending pull; it must not convert
a fresh protocol error into successful completion. Custom delivery admission
checks cancellation after each wait, keeps channel order/backpressure, and leaves
inline document frame delivery on its existing path. Transport read timeouts
exclude budget admission; delivery timeouts still include queue and style waits.
A receiver's own later asynchronous continuation remains an indivisible
receiver-owned unit. This does not change component render admission or the
signal producers' own scheduling policy.
