# Ready-backlog investigation (#1864)

The selected boundary is admission between complete units of work. Urgent state
still commits in a microtask; deferred/transition and ready-producer component
work enters a host task. Readers, stream pulls, ready stream publications, and
now ordinary query-promise publications share one approximately 5 ms window.
Independent islands activate once per document task, prioritizing captured input.
No policy can interrupt an individual subscriber, parser call, render, commit,
or Action callback. A task boundary offers the browser an opportunity; it does
not promise a paint or a particular input next.

## Reproduction and matrix

`browser-backlogs.mjs` bundles production source and drives native Chromium
input. The first key releases the backlog; subsequent keys arrive 10 ms apart.
It checks every publication (per producer), final UI, controlled draft, focus,
caret, island identity, and hydrated handlers. The equivalent Action and deferred
components also run on React. The fixtures use actual public hooks with slots;
the independent editor uses a compiler-generated `.tsrx` activation entrypoint.

```sh
node benchmarks/scheduler-responsiveness/browser-backlogs.mjs --quick --matrix --memory --cpu=6 --trace-dir=benchmarks/results/scheduler-traces
node benchmarks/scheduler-responsiveness/browser-backlogs.mjs --memory --scenario=queries,query,derived,rpc,renderer
node benchmarks/scheduler-responsiveness/browser-backlogs.mjs --memory --scenario=queries,query,derived,rpc,renderer --policy=count
node benchmarks/scheduler-responsiveness/browser-backlogs.mjs --memory --scenario=queries,query,derived,rpc,renderer --policy=combined
```

A positional checkout path selects the runtime baseline while retaining the
same fixture. `--quick` keeps one measured sample after one excluded warmup;
the default keeps five. Run serially on the same machine. `--cpu=1` provides the
unthrottled control. Use `--work-ms=0` for the cheap-result policy comparison.
The matrix includes four ordinary zero-work values and 100
values with 2 ms of subscriber/render work, ready and pending inputs, twelve
concurrent producers/roots, one chunk and 17-byte fragments, and 16 distinct
64 KiB transport payloads. A blocked-first Action control then drains 100 ready
callbacks with 2 ms of application work each in both runtimes. Pending producers
await native timers; ready producers return settled promises. Ordinary independent
query completions are separate from query streams. Reused retained values and hydration seeds do not
create a ready continuation chain; their synchronous semantics are covered by
`signals-native-seeds` and the signals node suite.

Reports include startup, first contentful paint, first publication, first commit,
completion, commits, passive bodies/cleanups, trusted input and Event Timing grouped by interaction ID,
rAF opportunities, and Chromium trace `RunTask`, `RunMicrotasks`, and `Paint`
events. Traces select the renderer thread from `backlog-start`; task/checkpoint
maxima include the **whole** overlapping event, not a clipped 5 ms slice.
`firstPaintAfterCommitMs` identifies a trace paint after the first useful commit;
it is not a compositor presentation timestamp or proof that every committed
pixel was displayed. rAF alone is not a paint. Missing Event Timing entries are
censored at Chromium's 16 ms floor and reported as `null`.

`--memory` samples allocations (including collected objects) and reports V8 heap
usage before work, at completion, and after disposal plus explicit GC. This is
whole-page evidence, including automation, logs and runtime bookkeeping, not
exact per-parser allocation accounting. The harness retains numeric observations;
heap deltas are not a zero-retention assertion. Large transport payloads are
encoded before input, so serialization is part of fixture startup, not reader
latency. Semantic controls compare the decoded payload contents before discarding
them. Timing and allocation samples are reports, not machine-speed CI thresholds.

## Finding: ordinary ready queries bypassed the budget

One hundred ready independent queries with 2 ms subscribers coalesced their
component rendering but still delivered every subscriber in one checkpoint.
`observePromise` bypassed `yieldForHostBudget`, which already guarded stream
results. The fix uses that same budget before publishing a promise result and
revalidates the request lease on every retry. It adds no queue, record fields,
public configuration, or unconditional per-render work. Rejections preserve prompt
failure notification and cleanup; expensive rejection bursts remain unpaced and
may overtake an earlier success waiting on the budget. A waiting successful
payload is retained only until its posted admission retry; retirement prevents publication.

The deterministic regression fails before the fix: all twelve results arrive
before the independent marker. It covers full completion, replacement while
waiting, and scope disposal. The production Chromium regression also fails on
the baseline: input cannot arrive between the first and last result.

## Measurements (2026-10-10)

Apple M5 Max, macOS arm64, Node 24.18.0, Chromium 149.0.7827.55, headless.
Runtime baseline `4fe0867ca3` versus that source plus `receivePromiseValue`.
The paired tables use one excluded warmup and five measured samples, serially,
at 6× CPU with allocation sampling and tracing enabled. Values are medians;
Event Timing is the median of each run's observed interaction p99, with the
16 ms censoring floor. These synthetic cases establish boundaries and costs,
not a general framework ranking.

| 100 independent query results, 2 ms per subscriber | Baseline | Paced |
| --- | ---: | ---: |
| Fixture startup (ms) | 57.0 | 60.1 |
| First value (ms) | 4.3 | 5.9 |
| First commit (ms) | 245.2 | 23.3 |
| Completion (ms) | 245.2 | 366.8 |
| Longest microtask checkpoint (ms) | 233.8 | 7.7 |
| Commits / passive bodies | 2.0 | 21.0 |
| Event Timing p99 (ms) | 248 | 24 |
| Later trusted inputs during work | 0 in all runs | 15 in all runs |
| Sampled whole-page allocations (KiB) | 868 | 1892 |

This trades roughly 50% more completion time and more accepted
commits/effects for visible progress and input between results. The repeated
component reads and lifecycle work remain real costs; this is not a throughput
win. With zero subscriber work, the same 100-query control takes
13.1 → 12.7 ms and keeps two commits including mount.
That small timing difference is not evidence of a speedup. Four-value ordinary
updates and pending inputs also pass at 1×/6× CPU; their single-sample matrix
numbers are diagnostic, not a regression threshold.

| Path (100 results × 2 ms) | Elapsed checkpoint / completion | Count checkpoint / completion | Combined checkpoint / completion |
| --- | ---: | ---: | ---: |
| queries | 7.7 / 366.8 ms | 18.7 / 347.4 ms | 7.8 / 368.8 ms |
| query | 7.6 / 331.1 ms | 11.2 / 356.3 ms | 7.7 / 371.8 ms |
| derived | 7.5 / 351.4 ms | 12.0 / 347.0 ms | 8.0 / 349.5 ms |
| rpc | 8.0 / 390.1 ms | 19.1 / 344.0 ms | 8.1 / 351.0 ms |
| renderer | 8.9 / 376.2 ms | 17.5 / 383.8 ms | 7.6 / 362.1 ms |

The count cap admits more expensive work per checkpoint and is sensitive to
checks per record. Adding it to elapsed budgeting provides no useful improvement
in these expensive cases. It slows the cheap cases by yielding before enough
work has accumulated:

| Path (100 results, zero subscriber work) | Elapsed completion / commits | Count completion / commits | Combined completion / commits |
| --- | ---: | ---: | ---: |
| queries | 12.7 ms / 2 | 36.4 ms / 9 | 41.9 ms / 9 |
| query | 13.1 ms / 2 | 32.7 ms / 16 | 33.9 ms / 16 |
| derived | 16.0 ms / 2 | 46.7 ms / 16 | 33.8 ms / 16 |
| rpc | 10.9 ms / 100 | 20.6 ms / 100 | 19.6 ms / 100 |
| renderer | 26.3 ms / 100 | 45.9 ms / 100 | 45.1 ms / 100 |

The full matrix validates 52 conditions at each CPU rate (one sample after
warmup). Representative 6× rows below use ready inputs and 100 values. FCP is
navigation-relative; the next paint column is relative to the input releasing
work. The longest post-completion task includes the observer-delivery tail.

| Path | Startup / FCP (ms) | Paint after first commit (ms) | rAFs during work | Longest task / post-completion task (ms) |
| --- | ---: | ---: | ---: | ---: |
| query (octane) | 53.2 / 88.0 | 23.9 | 39 | 16.0 / 1.4 |
| queries (octane) | 57.8 / 92.0 | 21.6 | 40 | 17.0 / 1.4 |
| derived (octane) | 50.6 / 84.0 | 22.0 | 40 | 15.9 / 1.3 |
| actions (octane) | 46.3 / 80.0 | 23.1 | 1 | 19.7 / 3.6 |
| actions (react) | 76.7 / 148.0 | 16.4 | 1 | 13.9 / 2.9 |
| islands (octane) | 81.5 / 52.0 | 16.9 | 49 | 21.5 / 1.1 |
| rpc (octane) | 49.3 / 84.0 | 15.7 | 44 | 20.2 / 1.5 |
| renderer (octane) | 47.7 / 76.0 | 16.9 | 42 | 22.0 / 0.4 |
| deferred (octane) | 48.3 / 84.0 | 220.2 | 1 | 206.1 / 3.8 |
| deferred (react) | 79.3 / 152.0 | 3324.3 | 31 | 202.6 / 1.5 |

The deferred fixture deliberately contains one atomic 200 ms component body.
Both runtimes show a roughly 200 ms task. React can abandon/retry that work
between keystrokes (completion was 3.3 s in this sample); Octane finishes the
started render. This diagnoses the atomic-work ceiling, not a throughput ranking.
No large post-completion callback hid the cost in these representative traces.

For sixteen distinct 64 KiB payloads, the RPC/custom-reader samples allocated
about 2.3 MiB each (sampled), with post-disposal JS heap deltas of +538 KiB and
−462 KiB respectively. The deltas include lazy runtime/browser bookkeeping and
retained harness state; they neither identify a payload leak nor prove all
payloads were collected. The full reports include backing-storage usage too.

The production browser fixture's bundle changes by +86 raw / +12 gzip bytes
when only the query publication fix changes; the React bundle is identical.
Against current main `c82354bf84`, the minimal `root-static`, `hooks-state`,
and `server-render` controls pass with identical raw/gzip/brotli sizes before
and after the fix (147117/47717, 62863/21102, and 64032/22031 raw/gzip bytes).
CI reports the broader byte/work matrix. No compiler output or runtime record shape
changes.

## Policy decision and compatibility audit

Keep the shared elapsed budget. The count-only counterfactual yields after eight
admission checks; the combined policy uses eight checks **or** 5 ms. Checks are
not logical values: streams can check both pull and publication; fragmented
readers also check while assembling records. The comparison changes only the
benchmark build of `host-budget.ts`, never shipped configuration. Island turns
and coalesced Action/deferred commits intentionally do not use this counter:
an island is one atomic hydration and an Action callback is application code.
A count cannot split one long callback. The blocked-first Action control also
exposes the cost of a queue of many expensive callbacks: Octane/React had
231/236 ms checkpoints, 256/260 ms completion and three commits each at 6× CPU.
Retain React-compatible callback invocation timing in this change: initial
synchronous dispatch can invoke application code before dispatch returns, and
later callbacks run as the preceding Action completes. Pacing only queued
callbacks would create a different invocation contract for that subset without
solving a synchronous application dispatch loop. This is an explicit retained
limit of the selected **render-admission** guarantee, not a responsiveness claim
for Action bodies. Changing callback invocation requires a separate contract
for synchronous side effects, native user activation, and async Action context.

Coalescing and pacing have distinct costs. Source subscriptions and direct bindings
observe every publication; components may render once per admission window.
More windows can mean more commits and earlier passive drains. Preserve lifecycle
work for accepted commits instead of dropping it to recover a benchmark count.
One-shot query results now pay the same admission check as streams; retained
ready reads still bypass producer execution entirely.

The same budget can defer a lone success after other work spends the window;
synchronous SSR after promise resolution may still see pending. Tests must await
the result across host tasks instead of counting microtasks. Awaited `act()` now
checks the existing budget sentinel in both async drains, including query and
derived streams. Before that fix, both callback forms returned with only 3–6 of
12 paced values published. The dev/prod regressions require all values and their
UI updates before the awaited call returns. The check runs only in the test
utility's drain, adds no queue or record fields, and preserves synchronous act
behavior before its returned promise is awaited.

The effect audit retains the established insertion/layout/ref commit phases,
cleanup-before-next-body, and passive drain before the next render. Passive
callbacks use post-paint scheduling with a fallback, but a following render can
drain them before paint. The scheduler documentation now states that limit.
`effect-timing`, `transition-flush-task`, `deferred-value-task`, `signal-task`, and
`reader-task` cover the observable boundaries, controlled restoration, `await 0`,
`flushSync`, `act()`, suspension, cancellation and ordered delivery in dev/prod.

Keep the narrower transition exceptions documented by [#1899](https://github.com/octanejs/octane/pull/1899) and
[#1911](https://github.com/octanejs/octane/pull/1911): nested cues
can revisit a descendant; native-signal Actions and release after a held promotion
can publish a separate falling edge; a hook-only falling edge follows Octane's
sibling **update** order rather than React's tree order. The earlier transition
work reduced ordinary cycle renders from 192 to 128 per 64 cycles while held
renders stayed at 320 and allocated one extra journal object per cycle (the
measurements recorded in #1911, not a new run here); these
exceptions do not establish a new starvation loop. Changing them here would
change publication/hold ownership without a failing responsiveness reproduction.
The browser Action/deferred controls and existing held-transition regressions
are the guardrails, not an assertion that every React internal render count matches.

The waiting independent-island editor preserves the original focused SSR input,
selection and an in-progress Korean composition across activation, then continues
and commits that composition without restarting it. Captured click replay occurs
once. The fixture deliberately uses a click-only strategy: typing remains native
while waiting. A CDP observation waits for real transient activation to expire,
releases the module without `userGesture`, and verifies that replay is untrusted
and activation remains false. Native gesture-gated work must run synchronously
in the original gesture; asynchronous loading cannot renew that authority.

The indefinitely ready-stream regression runs in a child process supervised by
an external kill deadline. Across three independent timer turns, all twelve
mixed query/derived producers advance in order; cancellation stops publication
and closes each iterator once. Disabling the shared budget makes both the single
and concurrent controls hit the external deadline. This proves sustained
producer/host-task progress independently of an in-page timer or finite backlog.
