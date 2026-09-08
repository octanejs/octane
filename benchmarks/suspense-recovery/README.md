# Suspense and async recovery

Production browser fixtures independently expose pending, rejected, recovered, and cancelled async states. The harness verifies that errors reach the visible boundary, retries clear the error, superseded slow work cannot overwrite a newer response, and every request is accounted for.

```bash
node benchmarks/bench.mjs --quick suspense-recovery
node benchmarks/bench.mjs suspense-recovery
```

## No-boundary root suspension work

The separate deterministic work control drives the existing production browser
regression fixture through component, branch, root, keyed-row, and empty-list
replacements. It observes a held render and its successful retry in fresh browser
contexts:

```bash
BENCH_JSON=benchmarks/results/root-suspension-work.json node benchmarks/suspense-recovery/root-work.mjs
```

Chromium precise call coverage (`--jitless`, production, unminified) records render,
transaction, list, and teardown calls without instrumenting component bodies. Each
replacement body must run once per actual attempt, the retired input body must not
run, and the reader must run once. A separate MutationObserver pass records writes
to the fixture container. Both passes verify retained DOM identity, focused input
draft and selection, no hold-time native focus events or cleanup, successful retry,
and exactly-once connected cleanup without reported errors. The existing React twin
independently verifies the same observable behavior and comment-stripped markup;
its physical DOM counts are informational, not a work ratio or a React Compiler
comparison.

This is not a timing benchmark: the pre-fix no-boundary path was semantically broken
and cannot supply a fair speed baseline. The five small cases do not measure
allocation volume or scaling, and the DOM observer excludes detached staging. The
runner fails on semantic or bounded-work violations, writes source/toolchain/asset
hashes with its counts, and keeps build artifacts under ignored `dist/root-work/`.
Without `BENCH_JSON`, the result is `dist/root-work/result.json`. This standalone
control does not change the seven-framework async-status suite above.
