# Scoped signals mutation pilot

Run the ordinary passing verifier with the repository's normal configuration:

```sh
pnpm exec vitest run --project octane-signals-mutations
```

`rows.mjs` contains one resource-lifetime row. Its `project` selects the existing
scoped signals configuration; the three expanded stream cases are pinned by full
name, and their unmutated Vitest IDs must match the mutant and no-op runs.
Each run uses a fresh process/report nonce and one worker thread. The transform
matches a query-stripped real filesystem path, requires one literal source match,
and must execute exactly once. It never changes the source on disk.

- **Passed control:** all three unmutated targets pass.
- **Killed:** all three mutant targets fail with one serialized `AssertionError`
  whose first parsed frame belongs to the target test file.
- **Survived:** all three targets pass after the mutant or explicit no-op transform.
- **Runner error:** invalid/stale reports, missing/duplicate/unexecuted targets,
  wrong source/transform counts, unexpected failures, incomplete ordinary
  before/after hooks, retries, suite/import/global errors, or process timeouts.

The verifier executes real stale/multiple source-match, unloaded-source,
non-assertion, missing-target, import, before/after-hook, and started-test timeout
controls. Separate report fixtures validate malformed/stale data and other report
edge cases. Root and sharded discovery must each collect the verifier only in
`octane-signals-mutations`.

This pilot validates the existing stream family, which uses ordinary `afterEach`
cleanup. It does not establish coverage completeness or arbitrary Vitest callback,
fixture-cleanup, or `aroundEach` hook provenance. Extend those guarantees before
adding rows that depend on such hooks.
