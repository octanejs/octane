# Client key encoding investigation

## Decision

Retain the current explicit/nested descriptor key encoding and standalone
component-key coercion. This investigation adds a reproducible work gate; it
does not claim a new key-path throughput or allocation improvement.

The earlier changes already removed top-level implicit string construction
([#1030](https://github.com/octanejs/octane/pull/1030)), repeated implicit and
explicit wrapper serialization
([#1034](https://github.com/octanejs/octane/pull/1034),
[#1060](https://github.com/octanejs/octane/pull/1060)), and the per-list key-reader
closures ([#1057](https://github.com/octanejs/octane/pull/1057)).

| Remaining operation | Contract and alternative considered |
| --- | --- |
| Top-level explicit prefix | Explicit key `"0"` must remain distinct from implicit position zero, and user strings must not collide with nested wrapper paths. Returning the raw descriptor key would need a different namespace representation. Per-key wrapper objects would lose equality between renders unless retained in another cache. Neither alternative removes this requirement. |
| Nested leaf encoding | Wrapper boundaries determine state preservation. Scalar JSON escaping keeps quotes, backslashes, control characters and path-like user strings unambiguous; one shared wrapper prefix is already reused. Removing the wrapper path changes survivor identity. Replacing JSON with a new escaping protocol adds a second implementation to maintain without measured benefit. |
| Custom serializer fallback | A replacement `JSON.stringify`, inherited `toJSON`, or customized `String` can observe the full tuple and mutate/retain its path. Reusing a prefix across those calls changes observable results. Existing tests include retained-array mutation, replacement during coercion, receiver identity and exceptions. |
| Standalone component coercion | `undefined` means no key; otherwise `'' + key` supplies default-hint conversion. Numeric `0` and string `"0"` preserve the same component. An object can return a new value without changing object identity; its changed value must remount. `String(key)` would change the hint and allow a Symbol that the existing contract rejects. A raw-identity cache would suppress observable coercion and miss that remount. |

An executed `'' + key` expression is not proof of a new string allocation when
the operand is already a string. The gate reports coercion-site executions,
not V8 allocations. Compiled/manual keyed lists may also use raw object or
Symbol identity; their key domain is separate from normalized descriptor and
standalone-component keys. The signal-instance protocol in #1069 separately
encodes raw keys and must not reuse these normalized reconciliation keys.

## Reproduction and work counts

```bash
node benchmarks/client-hot-paths/keys.mjs
CLIENT_SOURCE_ROOT=/path/to/frozen/source node benchmarks/client-hot-paths/keys.mjs
```

`CLIENT_SOURCE_ROOT` selects the complete Octane source tree, including public,
server and compiler-internal runtime entry points. The fixture is compiled with
the worktree compiler and bundled with esbuild in production mode. A clean
Chromium page runs the observable controls; a separate page runs an instrumented
bundle with counters at the exact encoding sites. All observers live only in
the benchmark bundle. HTML must agree between the clean and observed runs.

Baseline: `cece195a967d29d1682b37b7c87b9418a8076e95`, measured on Darwin arm64,
Node 24.20.0, Chromium 149.0.7827.55. A changed update traverses 128 regular rows
plus one explicit sentinel; nested cases have an additional outer tail.

| Case | Explicit flat encodings | Numeric flat positions | Shared path JSON | Scalar key JSON | Nested implicit encodings | Full tuple JSON |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Flat implicit + explicit `"0"` | 1 | 128 | 0 | 0 | 0 | 0 |
| Flat explicit | 129 | 0 | 0 | 0 | 0 | 0 |
| Nested implicit + explicit `"0"` | 1 | 0 | 1 | 1 | 128 | 0 |
| Nested explicit | 1 | 0 | 1 | 129 | 0 | 0 |
| Nested escaped explicit | 1 | 0 | 1 | 129 | 0 | 0 |
| Nested explicit, custom JSON wrapper | 1 | 0 | 0 | 0 | 0 | 129 |

Standalone component updates execute one keyed coercion in both the primitive
and object-key cases. The benchmark supplies different descriptor generations
before the observed update, so it measures traversal rather than descriptor
construction. No duration is inferred from these deterministic counts.

## Observable controls

- Full HTML and row order; distinct implicit zero and explicit `"0"`.
- Stable rows, keyed reverse/restore survivor identity, and typed uncontrolled
  values; focus through stable updates.
- Server HTML adoption without replacing existing rows or resetting typed
  values/focus.
- Escaped keys and a custom serializer that forces the full-tuple path.
- Numeric/string component-key equivalence, mutable object-key remount,
  default coercion hint, and descriptor Symbol-key rejection.

The related `deopt-child-key-aliasing`, `components`, `for`, and
`conformance/multichild-identity` correctness suites cover deeper wrapper
boundaries, custom serialization/coercion failures, raw object/Symbol list
keys, removal, reordering and transition recovery. Duplicate keys are outside
the survivor-identity guarantee; the investigation does not assign deterministic
identity to malformed duplicate-key lists.

## Limits

The production bundle includes the public exports used by these fixtures and
is not an application bundle-size benchmark. Instrumented counters are source
work claims; they do not measure heap allocation, flatten/hash cost, garbage
collection, browser paint or application latency. There is no new cache,
invalidation policy, retained memory or server implementation change here.
