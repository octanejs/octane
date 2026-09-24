# Initial document signal transport

Run the ongoing transport and adoption guard with pinned workspace dependencies:

```bash
node --test benchmarks/scoped-signals/initial-document-signals.test.mjs
```

The authored `initial-document-signals-consumer.tsrx` declares `route$` with a
`home` default. A request's `octane:document` scope sets it to a shared value,
serializes that scope for the early document bootstrap, and renders an eager
reader and two deferred `Hydrate` readers. The guard counts the encoded value in
the initial bootstrap JSON plus the three transmitted native manifest sidecars.
It compares the optional integration with the same build's omitted-option
control and retains a response whose history differs from the initial seed.

Both responses hydrate in separate JSDOM realms. The semantic controls preserve
the existing output nodes, deferred historical output, live writes before each
activation, post-commit current values, diagnostic-free adoption and cleanup.
Each reader's first layout effect observes its historical presented value beside
the independently current document value.

To record matched archived-baseline and candidate bundle/transport measurements,
provide an absolute report filename that does not already exist:

```bash
BENCH_JSON=/absolute/path/new-report.json node --test benchmarks/scoped-signals/initial-document-signals.test.mjs
```

Report mode reads the immutable baseline
`47580bd0eecf9a7369bc805c36c2ab1f8bc16de1` directly from Git. Esbuild receives
baseline `packages/octane/src` bytes through `git show`; both lanes use the same
compiled authored consumer and pinned dependencies. The report records compiler
and runtime/dependency input hashes and rejects source drift during a run.

The client and server bundles are complete minified consumer closures with
`process.env.NODE_ENV` defined as `production`. The public compiler uses
`dev: false` and `hmr: false` in both client and server modes. Raw, gzip level 9
and Brotli quality 11 sizes are recorded separately for bundles, the complete
response and concatenated JSON payloads. `RenderResult.signals` is already
represented by the transmitted native sidecar, so it is counted once.
Compression deltas are measurements; dictionary repetition can make a small
scalar reference cost compressed bytes even when its raw manifest shrinks.
JSDOM provides DOM adoption evidence; browser layout, paint and latency are
outside this measurement.
