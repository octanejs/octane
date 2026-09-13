# Custom-hook path work (#981)

This runner extracts the actual production `withSlot` and slot-resolution
helpers from the client, server, and universal runtimes. It compares them with
the frozen `6284156ce` source using the same local TypeScript/esbuild versions.
The candidate imports the shared bounded path cache; the baseline executes its
original string-building loops. No production source is rewritten by the runner.

```sh
BENCH_JSON=/tmp/custom-hook-path.json node benchmarks/custom-hook-path/run.mjs 6284156ce
node benchmarks/bench.mjs --ratios hooks-runtime
```

The recorded deterministic comparison used Node 26.4.0 / V8 14.6.202.34-node.21
on macOS arm64, with the same compiler dependencies for both source versions.
The first command prints the raw source diagnostics and writes the normalized
`hooks-runtime` targets, source paths, SHA-256 hashes, Node/V8 versions, semantic
controls, and optional timing samples. `--measure` disables improvement guards
when investigating a baseline; semantic controls still run. `--timing` adds
eight same-process samples of 10,000 depth-three calls with eight base hooks.
Those samples include fixture work and are helper diagnostics, not application
latency claims. The combined production browser comparison is documented in
[the Hooks audit](../hooks-runtime/README.md).

## Observable contract

Each measurement performs 1,000 custom-hook calls with eight explicit base
slots. Depths one, three, and twenty run with zero, one, four, and seven authored
arguments. The clean and observed helpers must return the same checksum, exact
argument values, argument count, and undefined callback receiver.

Separate untimed controls assert exact registry keys and resolved symbol
identity. They cover changed ancestors of equal encoded length, returning to an
earlier path, distinct numeric/symbol namespaces, delimiters and lone surrogates,
server string slots, forty base slots at every depth from one through twenty,
and universal objects with changing coercion results. Both ordinary replacement
functions and proxies around `Symbol.for` are installed before and after helper
initialization: each must receive `Symbol` as its receiver and run on every
resolution. None of those controls substitute a private hook store for the
runtime's public integration tests.

`custom-hook-call-contract.test.ts` exercises public roots, independent state
and ref identity through conditional/reordered custom calls and separate roots,
replacement registries, all four exported runtime surfaces, reflected function
arity, callback arguments, inherited Array iterator getters, and iterator errors.
Existing manual-hook tests cover reentrant universal coercion and failed-render
retry. Removing the prefix comparison fails the independent-call-site test in
both development and production; bypassing the registry identity guard fails
the replacement-registry test in both. Both mutations were restored afterward.

## Measured source work

The `cold` target is the first depth-three pass, after the depth-one cases have
primed the outer prefix. `warm` repeats that path with a different callback
argument count. Cache state intentionally survives those calls, as it does
between real renders.

| Work per 1,000 depth-three calls | Baseline | Candidate |
| --- | ---: | ---: |
| Registry calls, first depth-three pass | 8,000 | 8 |
| Registry calls, repeated path | 8,000 | 0 |
| String construction sites, repeated path | 128,000 client/server; 64,000 universal | 0 |
| `withSlot` rest sites | 3,000 | 3,000 |
| Registry calls at depth twenty | 8,000 | 8,000 |

The first depth-three candidate pass reaches forty string construction sites.
The observer counts string-building `+`, `+=`, and interpolated template
expressions in the extracted helper; it does not equate those source sites with
heap strings or physical allocations. It runs only in the observed copy. The
unmodified copy supplies semantic and optional timing controls. The runtime's
existing coercion reads still execute, including universal's two `String` or
Symbol-description reads per segment.

The bounded probe reaches sixteen frame records, at most thirty-two base entries
per frame, and 480 retained base entries in total. Depth zero returns directly,
so only the fifteen depths one through fifteen hold base-entry Maps. The
`custom-path-{client,server,universal}-{cold,warm,bounds}` ratio targets use
`custom-path-budget` (one unit for every operation). Over-depth diagnostics also
assert the full 8,000 cold registry calls, retaining that fallback as a control.

## Retained costs and rejected argument shortcut

The cache is module-local and retains primitive keys, normalized descriptions,
encoded prefix strings, and resolved symbols. It retains no Scope, Owner,
component state, ref, or user object. A fresh depth-three path with eight base
slots creates four frame records, one Map, and eight entry records; subsequent
matching paths reuse them. At most sixteen frames and fifteen Maps can retain
480 entries. This bounds record count, not the byte length of authored strings.
Changing a prefix replaces the entry's previous prefix/result; unrelated paths
at the same depth can therefore miss or displace each other's useful cache
values without accumulating an unbounded path tree. There is no per-component
record added and no ordinary-root allocation saving claimed.

The proposed `withSlot` arity shortcut was rejected. Its fast path looked up
`Array.prototype[Symbol.iterator]` on the prototype itself; the original spread
reads it with a fresh rest Array as the getter's receiver. That receiver and the
iterator's resulting argument sequence are observable. Preserving that protocol
would require additional checks or materialization, so `withSlot` keeps its
original rest/spread implementation. The cache improvement does not depend on
changing callback invocation. The source rest-site count above is retained as
evidence; engine escape analysis may remove physical arrays independently.
