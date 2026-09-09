# Host component child forwarding

This focused production benchmark exercises `hostComponent`, the runtime host
adapter used by components such as `motion.div`. Each parent render supplies a
fresh children body while Octane preserves the host element and positional child.

```sh
node benchmarks/host-component/work.mjs
# Observe a baseline that still has a rest parameter:
BENCH_JSON=/tmp/host-component-baseline.json node benchmarks/host-component/work.mjs --measure
```

The runner bundles the actual client runtime with esbuild's production define,
serves it on an ephemeral local port, and launches Chromium with `--jitless`.
It measures 128 and 1,024 hosts on mount, update, twelve consecutive updates,
and unmount. No workspace package installation or long-running preview server
is required once the repository's dependencies are installed. The runner closes
Chromium and the local server and removes its generated `dist` directory in
`finally` cleanup, including failed runs.

The function-child fixture renders a span through a fresh body per host and
render. An equivalent descriptor-child control renders the same elements and
text without using the forwarding trampoline. Every measurement verifies host
and child cardinality, updated attributes and text, persistent DOM identity,
parent/child nesting, and empty DOM after teardown.

The observer parses the emitted bundle to locate the children trampoline and
its rest parameter, then attributes Chromium's precise function-call coverage
to that exact source range. Each execution of a rest-parameter function creates
one argument array in this interpreter-only pass. Multiplying that count by the
number of rest parameters gives a deterministic allocation-work count; it does
not claim that an optimizing JIT cannot eliminate the allocation after warmup.
The descriptor control requires zero trampoline calls and zero rest arrays.
Function-child work must execute exactly once per host and render in either
implementation, so removing children work cannot produce a false improvement.

The default gate requires zero rest parameters. `--measure` preserves all
semantic and work-cardinality checks while reporting an older implementation.
`BENCH_JSON` writes the measurements, runtime/bundle/trampoline hashes, and
browser/Node versions. No application throughput gain is inferred from these
untimed counts.

## Recorded comparison

Node v26.4.0 and Chromium 149.0.7827.55, with the production configuration above:

| Function children | Hosts | Trampoline calls, both versions | Rest arrays, before | Rest arrays, after |
| --- | ---: | ---: | ---: | ---: |
| Mount or one update | 128 | 128 | 128 | 0 |
| Twelve updates | 128 | 1,536 | 1,536 | 0 |
| Mount or one update | 1,024 | 1,024 | 1,024 | 0 |
| Twelve updates | 1,024 | 12,288 | 12,288 | 0 |

All descriptor-child cases and all unmounts report zero trampoline calls and
zero rest arrays in both versions. Host calls are unchanged: twice the
trampoline count for function children, once per host and render for descriptor
children, and zero during unmount. Every semantic control passes in both versions.
The unminified observer bundle grows from 432,907 to 432,933 bytes (+26 bytes).
