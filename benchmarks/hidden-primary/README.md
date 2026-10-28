# Updates while a split child is pending

This standalone Node/jsdom benchmark isolates parent updates of client-mounted
`<Hydrate>` boundaries. Each fresh root renders 32 keyed rows that share one
compiler-extracted child module.

The timed operation consists of eight synchronous updates to a value captured
by every row. In the pending case, mount and updates run in one JS turn, before
the dynamic import can resolve. The resolved control yields and waits for every
child to mount before timing. Each sample checks the parent output, every
child's latest captured value at reveal, and a subsequent update.

Install the locked dependencies in both worktrees and run the benchmark from
the candidate checkout.

```sh
git worktree add --detach ../octane-hidden-base 8f5d4329498da2be027069d9166f5ede14dc0842
pnpm install --frozen-lockfile
(cd ../octane-hidden-base && pnpm install --frozen-lockfile)
BENCH_JSON=result.json node benchmarks/hidden-primary/run.mjs 51 ../octane-hidden-base
```

The runner builds the candidate's fixture against each tree's Octane source.
For a single-tree run, omit the final argument.

Each case gets four warmups. With a base checkout, the runner alternates order
and collects adjacent base/candidate samples for each case. JSON includes raw
durations in milliseconds and the median paired candidate/base ratio with a
bootstrap 95% interval. Initialization, waiting, verification and teardown are
outside the timed interval. These are Node/jsdom update costs.

A separate untimed pass enables V8 precise call coverage on an unminified
production build to count `SuspenseException` constructions during the eight
updates. A separate mount-only sample must record exactly one throw per row.
The pending count subtracts this fixed mount cost. The resolved control starts
counting after reveal and must record zero update suspensions. In paired mode
the runner also requires that the base reproduces redundant pending throws
and the candidate eliminates them.

The runner reports the entire minified client fixture, summing gzip level 9
bytes per emitted JavaScript chunk (including the split child). Its SHA-256
covers sorted chunk names and contents.

## Results

Two independent runs on 2026-10-28 used Node 26.12.1 on macOS arm64, Vite 8.1.5,
jsdom 30.0.1 and base `8f5d4329498da2be027069d9166f5ede14dc0842`. Each run
collected 51 pairs per case. Durations are for all eight updates in one sample.

| Case | Base median (ms) | Candidate median (ms) | Base → candidate p95 (ms) | Paired ratio [95% interval] | Update throws |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pending module | 0.334 | 0.092 | 0.454 → 0.159 | 0.2756 [0.2634, 0.2964] | 256 → 0 |
| Resolved module | 0.446 | 0.426 | 0.641 → 0.570 | 0.9552 [0.9258, 0.9997] | 0 → 0 |

In the second process, the pending ratio was 0.2795 [0.2659, 0.2969] and the
resolved ratio was 0.9927 [0.9714, 1.0117]. Pending updates took about 72%
less time in both runs. The resolved control showed no consistent speedup.
Both builds recorded the 32 initial suspensions. The three minified production
chunks totaled 80,775 gzip bytes on base and 80,922 on the candidate
(+147 bytes, +0.18%).
