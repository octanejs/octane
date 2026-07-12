# benchmarks/baselines

Committed regression data for the unified runner (`benchmarks/bench.mjs`). Two
kinds of data live here, and they are enforced very differently:

## `ratios.json` — hardware-independent ratio guards (the CI gate)

A flat array of guards, each
`{ suite, op, target, reference, maxRatio?, minRatio?, note }`. For a given
suite result the runner computes `target.score / reference.score` (falling back
to `median` for older records). Both sides are measured on the **same machine in
the same run**, so the number is hardware-independent, and the runner **fails if
it exceeds `maxRatio` or falls below `minRatio`**. Only guards whose both sides
actually ran are checked.

This is the check `.github/workflows/bench.yml` enforces (`--ratios`). It is safe
to enforce on any runner from day one because it is a ratio, not an absolute
time. Ratio bounds are seeded with generous headroom over the known numbers (see
each guard's `note`) so ordinary run-to-run noise never trips them — they catch a
*structural* regression (e.g. octane falling off a fast path, or a deopt cliff
collapsing because the fast path stopped being fast).

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

Written by `--record`, read by `--compare`. These are millisecond numbers, so
they are **specific to the machine that recorded them** — CPU, OS, Node version,
thermal state. They are committed only so an individual developer can track their
own machine's regressions across branches; **they are not a CI gate** and the
committed copy will reflect whoever last ran `--record`.

`--compare` uses a noise-aware rule (a regression needs score > 1.15× *and*
min > 1.10× baseline, plus an absolute >0.1ms excess for sub-1ms ops), but it is
still only meaningful against a baseline you recorded on the *same* machine.

> **Caveat:** if `local/*.json` looks "wrong", it is almost certainly because it
> was recorded on a different machine than yours. Re-run `--record` locally
> before trusting `--compare`.
