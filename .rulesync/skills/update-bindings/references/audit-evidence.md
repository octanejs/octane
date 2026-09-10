# Audit evidence and freshness

Read this when assessing an audit report or handing findings to implementation.
The executable contract is `node scripts/bindings-audit.mjs --help`, with validation in
`scripts/bindings-audit-lib.mjs`; use these if the schema changes.

## Reports and assessments

`selection.bindings` records the exact selected set. Each binding records its
repository-relative `directory`, collection state, releases, `baselineIds`,
failures, and facts. Each baseline records repository identity and receipt history
with discovered branch, full SHA, fetch time, checkout path, and checkout status.
Release metadata is independent of remote default-branch identity: a newer commit
does not establish a published dependency update or a tested upgrade.

The `findings` and `evidence` arrays distinguish `origin: "collection"` from
`origin: "assessment"`. Keep collected entries intact. To add an assessment:

- Give the finding a unique `id`, binding name, supported `category`, `summary`,
  ISO `assessedAt`, and nonempty `evidenceIds` referring to assessment evidence.
- Set its `baselines` map to every ID in that binding's `baselineIds` and the
  full SHA of the successful receipt actually inspected.
- Add each evidence item with a unique `id`, the same `binding`,
  `origin: "assessment"`, the same `baselines`, an identifiable `location`, and
  the observed result in `observation`.
- For `functional-gap` or `compatibility-defect`, include
  `consumerFailure: { scenario, expected, actual }`. A missing wrapper path is
  convenience coverage when the required vanilla behavior works through upstream.

Do not promote package metadata, file counts, or a successful fetch into behavioral
proof. An audit can inspect existing evidence and use bounded isolated consumer
probes when authorized; it must not run arbitrary upstream or package scripts.
The selected update workflow owns the applicable package validation.

`revalidate` and `report` refresh remote baselines and release identity on every
invocation. Both update the input artifact unless `--output <external-path>` is
provided; `report` renders the result. `--finding` selects the handoff/exit check,
not a waiver of failed repository acquisition or stale all-selection coverage.

## Compare the implementation checkout

`binding.facts.files` contains package-relative paths, byte sizes, and fingerprints.
Resolve each under `binding.directory` in the implementation checkout. Recompute
the fingerprint using the repository helper, not a plain digest of file bytes:

```js
import { readFileSync } from 'node:fs';
import { fingerprint } from './scripts/react-port/report-lib.mjs';

const observed = fingerprint(readFileSync(implementationFile).toString('base64'));
```

Compare every relevant source, export manifest, dependency declaration, status,
license, and validation input. Audit facts cover tracked package files; inspect
new/untracked files and shared configuration separately against the fetched Octane
checkout. Preserve a record of accepted local differences and their relevance.
Missing or mismatched files require inspection and reassessment before work starts;
matching branch names or `HEAD` alone is insufficient. After implementation, use
the recorded pre-edit comparison to distinguish intended edits from baseline drift.

## Invalidation and reassessment

Changed Octane/library SHAs invalidate dependent findings conservatively. Release
changes may invalidate them even if Git did not move. Failed fetches or missing
metadata leave affected findings incomplete. An all-selection inventory change
requires a new audit to establish coverage. Changed or missing source repository
identity also requires a new audit that binds the intended source.

For affected findings, inspect the replacement checkouts and release metadata and
rerun the consumer or maintenance evidence. Prefer a new audit when collected facts
or source identity changed. Reassessment within an existing report is valid only
with new observed evidence, a new assessment time, and matching replacement SHA
maps on both findings and evidence; use the current `releaseCheck.fingerprint` as
the finding's `releaseFingerprint` only after reviewing that release identity.
Keep invalidation history. A remote returning to an earlier SHA does not restore
an invalidated assessment automatically.

Never mark an old report current by editing timestamps, SHAs, release fingerprints,
freshness flags, or history alone. Run `report` after genuine reassessment and
preserve any remaining partial/stale result instead of claiming latest coverage.
