# benchmarks/baselines

Committed regression data for the unified runner (`benchmarks/bench.mjs`). Two
kinds of data live here, and they are enforced very differently:

## `ratios.json` — paired ratio guards (the CI gate)

A flat array of guards, each
`{ suite, op, target, reference, maxRatio?, minRatio?, note }`. For a given
suite result the runner computes `target.score / reference.score` (falling back
to `median` for older records). Both sides are measured on the **same machine in
the same run**, which cancels much shared variation, and the runner **fails if it
exceeds `maxRatio` or falls below `minRatio`**. Byte and count ratios are exact
for a fixed toolchain; browser and CPU timing ratios still carry JIT, scheduler,
and environment noise. Only guards whose both sides actually ran are checked.

This is the check `.github/workflows/bench.yml` enforces (`--ratios`). Timing
bounds include headroom over paired measurements (see each guard's `note`) so
ordinary run-to-run noise does not trip them; deterministic byte/count bounds can
be much tighter. Together they catch structural regressions such as Octane
falling off a fast path or shipped output retaining an optional feature graph.

To propose refreshed guard values from a real run:

```bash
node benchmarks/bench.mjs --record --ratios <suites…>
```

This writes `ratios.suggested.json` (upper bounds at observed ratio × 1.5, lower
bounds at observed ratio / 1.5, rounded) **without** touching `ratios.json`.
Review it and hand-copy any values you want — never auto-overwrite the committed
guards, or you will ratchet the gate toward whatever the last machine happened to
measure.

## `local/<suite>.json` — absolute baselines (LOCAL-ONLY)

Written by `--record`, read by `--compare`. Timing operations are milliseconds
and are **specific to the machine that recorded them** — CPU, OS, Node version,
and thermal state. Other suites record deterministic bytes, counts, scores, or
observable snapshots; those remain meaningful when the toolchain and fixture are
unchanged. The absolute-baseline comparison is still a local developer aid, not
a CI gate, and the committed copy reflects whoever last ran `--record`.

`--compare` uses a noise-aware rule (a regression needs score > 1.15× *and*
min > 1.10× baseline, plus an absolute >0.1ms excess for sub-1ms ops), but it is
still only meaningful against a baseline you recorded on the *same* machine.

> **Caveat:** if timing values in `local/*.json` look wrong, they were probably
> recorded on a different machine. Re-run `--record` locally before trusting a
> timing `--compare`; investigate deterministic byte/count differences instead
> of dismissing them as machine noise.
