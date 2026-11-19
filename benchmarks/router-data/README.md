# router-data

What a data router costs on the journeys a user feels. The suite drives a real router on each
target, unlike [`spa-navigation`](../spa-navigation/), which leaves routers out to isolate
renderer work. It measures how many requests each navigation makes, how many sequential waves
they take, how long the user waits, and how much CPU the router itself spends.

It is the benchmark for the [`octane/router` RFC](https://github.com/octanejs/octane/issues/3001).
`octane-floor` wires that RFC's mechanism by hand: a location signal, one explicit scope and
resource per match, transitions, intent preload, and a single-flight optimistic mutation, all
compiled under Strong mode. `octane/router` must stay within 10% of it, and both must beat
every other target.

```bash
node benchmarks/bench.mjs router-data
node benchmarks/bench.mjs --quick router-data
node benchmarks/bench.mjs --ratios router-data
```

## The app

Every target renders the same tree. Each route has its own loader against
[`shared/api.js`](shared/api.js), which answers every read and write after `DELAY` ms and logs
each call's start and end.

```
.shell > nav (#l-home #l-cold #l-sib #l-tab #l-pre)
  /org/:org                     .org[data-org]          loader org
    /project/:project           .project[data-project]  loader project
      /task/:task?tab=          .task[data-task][data-tab] > .task-title, form.rename
                                loader task; tab is read by the component only
```

## The journey

Each iteration runs on a fresh page.

| op | step | floor (fixed by the journey) |
| --- | --- | --- |
| `cold_nested` | home → `/org/1/project/2/task/3` | 3 reads in 1 wave |
| `sibling` | → task 4 (only the leaf's params change) | 1 read |
| `search_unread` | → task 4 `?tab=b` (no loader reads `tab`) | 0 reads |
| `preload_intent` | hover the task 7 link, wait 150 ms, click | 0 reads after the click |
| `mutation` | rename task 7 through its form | 1 write, 1 wave |
| `back_cached` | `history.back()` to task 4 `?tab=b` | 0 reads before the DOM is restored |

The journey runs in two passes:

- **Latency pass** (`DELAY` 20 ms, no throttle). Records the time to the committed DOM, plus
  `<op>_reads`, `<op>_writes` and `<op>_waves`. A wave is a request that could have waited on
  an earlier response.
- **CPU pass** (`DELAY` 0, 4× CPU throttle). `<op>_cpu4x` is the router's own work per
  navigation.

`js_gzip_kb` is every built JavaScript file, gzipped.

## Route matching

[`trie/run.mjs`](trie/run.mjs) is a Node-only run in the same suite. It times the RFC's route
matcher, [`trie/trie.js`](trie/trie.js), against a ranked RegExp list on route tables of 50, 200
and 1,000 routes. The URL mix covers static and parameter hits, a static that wins over a
parameter, optional and splat segments, encoded params and misses. Its op is `match_ns_<size>`,
in nanoseconds per match. Its gate is fatal: both matchers must return the expected route and
params for every URL.

| routes | octane-trie | ranked-regex |
| --- | --- | --- |
| 50 | 98 ns | 438 ns |
| 200 | 100 ns | 2,126 ns |
| 1,000 | 101 ns | 26,667 ns |

The RFC's Phase 0 bar is under 1 µs per match. The trie stays near 100 ns at every size, while
the RegExp list grows with the table.

## Gates

These are fatal and checked on every iteration, in both passes:

- every op reaches its exact final DOM;
- the `.org` and `.project` layout nodes survive the sibling and search navigations by
  identity;
- the previous task stays on screen until the next one commits, with no blank frame;
- no page errors.

## Targets and their best configuration

Each target uses the configuration its documentation recommends for this journey, so the gaps
come from the design and not from defaults.

| target | stack | configuration |
| --- | --- | --- |
| `octane-floor` | Octane, `octane/signals`, Strong mode | the RFC mechanism by hand ([`src/router.ts`](octane-floor/src/router.ts)) |
| `octane-remix-router` | `@octanejs/remix-router` (React Router 8.2 port) | same as `react-router` |
| `octane-tanstack-router` | `@octanejs/tanstack-router` | same as `tanstack-router` |
| `react-router` | React Router 8.2 data mode, React 19 with the React Compiler | `shouldRevalidate` skips parents on search-only changes and after the task's action. Data mode has no loader cache or data preload (`Link prefetch` needs framework mode) |
| `tanstack-router` | `@tanstack/react-router`, React 19 with the React Compiler | intent preload (50 ms), `staleTime` 30 s, `invalidate` filtered to the task route |
| `sveltekit` | SvelteKit 3.2 SPA (adapter-static) | `data-sveltekit-preload-data="hover"`, loads that never read the search, `depends`/`invalidate` for the task |

## Results (2026-11-17, local, 10 iterations)

Latency pass (time, reads, waves):

| op | octane-floor | octane-remix-router | octane-tanstack-router | react-router | tanstack-router | sveltekit |
| --- | --- | --- | --- | --- | --- | --- |
| cold_nested | 24.1 ms r3 w1 | 25.4 ms r3 w1 | 25.5 ms r3 w1 | 24.4 ms r3 w1 | 24.3 ms r3 w1 | 31.0 ms r3 w1 |
| sibling | 22.1 ms r1 w1 | 23.1 ms r1 w1 | 23.7 ms r1 w1 | 23.1 ms r1 w1 | 23.0 ms r1 w1 | 22.4 ms r1 w1 |
| search_unread | 0.8 ms r0 | 2.3 ms r0 | 3.3 ms r0 | 2.3 ms r0 | 2.1 ms r0 | 1.9 ms r0 |
| preload_intent | 1.2 ms r0 | 25.3 ms r3 w1 | 3.5 ms r0 | 26.0 ms r3 w1 | 2.6 ms r0 | 1.9 ms r0 |
| mutation | 22.2 ms w1 | 45.8 ms r1 w2 | 45.0 ms r1 w2 | 45.8 ms r1 w2 | 43.9 ms r1 w2 | 43.7 ms r1 w2 |
| back_cached | 1.1 ms r0 | 24.1 ms r3 w1 | 3.2 ms r1 w1 | 24.4 ms r3 w1 | 2.8 ms r1 w1 | 24.9 ms r3 w1 |

CPU pass, 4× throttle (ms):

| op | octane-floor | octane-remix-router | octane-tanstack-router | react-router | tanstack-router | sveltekit |
| --- | --- | --- | --- | --- | --- | --- |
| cold_nested | 16.07 | 18.22 | 16.06 | 13.46 | **11.51** | 13.19 |
| sibling | 3.66 | 5.61 | 5.37 | 3.52 | 4.25 | **2.87** |
| search_unread | **1.47** | 3.05 | 4.46 | 2.71 | 2.58 | 2.01 |
| preload_intent | 2.16 | 6.27 | 4.10 | 5.26 | 3.19 | **1.95** |
| mutation | 5.23 | 11.25 | 7.48 | 7.39 | 4.04 | **2.55** |
| back_cached | **2.18** | 4.64 | 4.44 | 4.58 | 3.58 | 4.01 |
| js_gzip_kb | 68.5 | 115.8 | 123.4 | 91.9 | 86.8 | **41.5** |

**What this says:**

- **The design wins on request shape.** Only `octane-floor` reaches every floor: no reads after
  a preload, no reads on a cached revisit, and one wave for a mutation.
- **The floor loses on CPU and bytes, so it is not best in class yet.**
  - `cold_nested` is 16.1 ms ±3% against TanStack's 11.5 ms. Both Octane ports also land at
    16–18 ms, which points at Octane's first transition and suspend path rather than at
    router logic.
  - Bytes trail SvelteKit's 41.5 KB.

- **The CPU gaps are first-use cost, not steady-state cost** (2026-11-19, 4× throttle, 10
  pages):
  - `cold_nested` is the page's first transition, first suspend and first resource. It runs
    311 runtime functions for the first time, 67 KB minified, where TanStack Router runs 141
    functions and 36 KB. A trace charges 10.7 ms to `V8.CompileCode` against TanStack's 6.7 ms.
    A second, equally fresh nested navigation in the same page takes 3.0 ms, against 15.0 ms
    for the first.
  - `mutation` is the page's first action and optimistic write. A first rename takes 4.4 ms;
    the second and third take 1.2 and 1.3 ms. TanStack Router takes 4.5, 3.0 and 2.3 ms, and
    SvelteKit 2.9, 1.6 and 1.4 ms. The optimistic render and the confirmed render are both
    needed, because the form reads the confirmed title, so the steady state already leads.

  The RFC's Phase 0 carries each of these as a work item.

## Guards

[`baselines/ratios.json`](../baselines/ratios.json) holds the floor's design wins:

- **Counters:** `cold_nested_waves`, `preload_intent_reads`, `back_cached_reads` and
  `mutation_waves`.
- **Timings:** `preload_intent` and `back_cached` against React Router, and `mutation` against
  TanStack Router.

There are no CPU guards yet. A new suite records work before it gains a ceiling. Add them once
`octane/router` lands, as `octane-router ≤ 1.10× octane-floor` and
`octane-router ≤ 1.0×` the best competitor on each `_cpu4x` op.

## Planned

- **An `octane-router` target**, when the package exists.
- **SSR and hydration ops** (`hydrate_refetch_reads`, `hydrate_interactive`, `defer_stream`),
  once the RFC's Phase 2 lands. They will need server targets for React Router framework mode,
  TanStack Start and SvelteKit SSR.
- **A deeper tree and a 10-level variant**, so that per-match cost scales visibly.
