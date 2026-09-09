# Scoped descriptor shapes

This Node-only production benchmark covers the client and server forms of
compiler-created scoped JSX element and value descriptors. It calls
`createScopedElement` and `createScopedValue` through the compiled runtime and
checks public descriptor properties, deferred child reads, clones, and
`Children.map` key replacement. It uses 128 and 1,024 elements with the same
authored prop shape; a plain `createElement` descriptor is the no-deferred
control. At 1,024 elements it separately measures named field reads and
`for...in` enumeration. The server also renders a 128-row descriptor tree to
HTML with identical plain and scoped trees.

Each creation, clone, and `Children.map` sample verifies that child resolvers
did not run before inspection. After timing, every element is checked for its
key, title, enumerable descriptor and props keys in order, accessor ownership,
and equal `descriptor.children`/`props.children`. A stable SHA-256 semantic hash
is emitted for each target. Server HTML and CSS are compared to an explicit
expected string. An untimed preflight also clones and maps a scoped value whose
resolved element has scoped children; it checks both receivers retain deferred
access after the copy. Five untimed warmups precede the timed samples, and target
order reverses every round. Client and server samples run in separate Node
processes so their distinct shared accessor functions cannot affect each
other's V8 hidden classes. Timings are microseconds per processed element.

```bash
node benchmarks/scoped-descriptor-shapes/run.mjs 7
node benchmarks/bench.mjs --quick scoped-descriptor-shapes
```

For a frozen baseline, set **both** `BENCH_CLIENT_RUNTIME_URL` and
`BENCH_SERVER_RUNTIME_URL` to absolute `file:` URLs for production `runtime.js`
and `runtime.server.js`. When unset, the script builds the current Octane
package. Set `BENCH_JSON` to write benchmark-schema results for interleaved
baseline/candidate comparisons. Compare hashes before comparing timings.

The production Node run isolates descriptor allocation and property access. It
does not measure browser layout, hydration, GC pause distributions, or the
compiler's generated call overhead. The SSR target includes other renderer work,
so a small SSR timing change inside observed variance is inconclusive. Scope
freshness and the semantics of replacing children receive behavioral tests in
the Octane package rather than being inferred from these timings.

## Paired production measurement

Against frozen `main`, the final candidate was measured in B–C–C–B order, with
13 timed samples and five untimed warmups per run on Node 26/macOS arm64.
Each row below is the candidate/baseline ratio of the paired mean at 1,024
elements. “Adjusted” divides that ratio by the matched plain-element control's
ratio to account for run-to-run drift. Values below 1 are faster. All 48 target
hashes matched across all four runs.

| Operation | Client raw | Client adjusted | Server raw | Server adjusted |
| --- | ---: | ---: | ---: | ---: |
| Scoped element create | 0.85× | 0.94× | 0.89× | 0.81× |
| Scoped element field reads | 0.39× | 0.84× | 0.29× | 0.64× |
| Scoped element `for...in` | 0.06× | 0.09× | 0.06× | 0.08× |
| Scoped element clone | 0.66× | 0.76× | 0.73× | 0.77× |
| Scoped element `Children.map` | 0.69× | 0.73× | 0.82× | 0.78× |
| Scoped value create | 0.92× | 1.02× | 1.14× | 1.04× |
| Scoped value field reads | 0.51× | 1.08× | 0.38× | 0.85× |
| Scoped value `for...in` | 0.12× | 0.18× | 0.13× | 0.17× |

Scoped-value creation was 1.02–1.04× its matched control after adjustment, so
these runs show no clear gain or regression. Scoped-value field reads also
overlap the plain-read control after adjustment. The server's full scoped SSR
target was 0.93× baseline, while the plain SSR control was 1.00×; its small
relative improvement is inconclusive. Client scoped-element construction shows
only a small relative difference. The strongest evidence is the fast-property
transition and the consistent enumeration gain. Client and server ran in
separate Node isolates so their distinct shared accessor functions did not
contaminate each other's maps.
