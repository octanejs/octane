# Universal external-store overhead

This Node-only suite bundles the production native universal runtime and drives
its public object renderer. It isolates store subscription lifetime and queued
state work; it does not measure DOM, compiler, native-device, or transport cost.

```bash
node benchmarks/universal-external-store/run.mjs 5
node benchmarks/bench.mjs --quick --ratios universal-external-store
```

The standard command uses the workspace's installed `esbuild`. For an exact
before/after comparison, `OCTANE_UNIVERSAL_STORE_RUNTIME=/absolute/runtime.mjs`
can select a separately bundled production `universal-native.ts` from either
revision. Both runs must use the same bundle options, Node version, iteration
count, and otherwise quiet machine. `BENCH_JSON` writes the normal benchmark
result contract.

## Workloads and controls

- `stable-getter` and `inline-getter` mount 128 readers with stable subscription
  functions. Each warms up with five parent renders and five store updates,
  then measures 20 of each operation per sample. Timings are milliseconds per
  parent render or flushed store update. Every phase checks current host values,
  generation props, retained host identities, and live listener count. Teardown
  must release every listener.
- `changing-subscribe` does the same work with a fresh subscription function on
  each render. Its required reconnects are the negative control: changing what
  owns a subscription must still disconnect the previous source.
- `subscription-reference` permits one lifetime subscription and cleanup per
  reader. The deterministic `lifetime_subscribe_calls` and
  `lifetime_unsubscribe_calls` operations feed the same-run ratio guards; both
  stable targets have a maximum ratio of 1. Their counts do not depend on timing
  noise or iteration count.
- `notification-burst-2000` and `notification-burst-8000` time only the synchronous
  notification loop, before the resulting render is flushed. Unchanged snapshots,
  one repeatedly notified changed snapshot, and distinct snapshots separate
  ordinary comparison overhead from queued invalidation cost. Two warmups precede
  the requested samples. Final values and retained host identity are checked.
  The `functional_updates` operation is a plain `useState` negative control:
  ordered functional queues cannot take a direct-replacement shortcut.
- `state-replacement-burst` queues one instrumented functional updater followed
  by 2,000 direct replacements, reading the public state getter after each.
  The committed state and a later functional suffix check value and ordering.
  `prefix_updater_calls` is a deterministic work metric, not a public guarantee
  about exact updater invocation counts. Its reference budget of 3 allows the
  eager enqueue, first prior-value observation, and ordered commit; a different
  correct implementation that invokes it fewer times also passes. This guards
  both urgent and projected lookups against rescanning an irrelevant prefix.

Stable subscription lifetime does not eliminate every notification read. An
actual notification still uses the existing universal state/lane machinery so
memoized owners update, urgent notifications can interrupt held transitions,
and abandoned renders can retry. Repeated urgent notifications during a held
transition may still enqueue rebase work. The suite's burst timings are
diagnostics; the deterministic lifetime and replacement-work ratios are the
durable performance gates.
