---
targets: ['*']
name: update-bindings
description: Audit one, several, or all existing Octane bindings; implement selected maintenance findings or remove redundant copied files with evidence matched to source ownership. Use for binding updates, lifecycle fixes, dependency or metadata maintenance, and convenience-import requests.
---

# Maintain Octane bindings

Prefer direct upstream imports for demonstrated framework-neutral APIs. Octane
should own the hooks, adapters, and components required for integration. A missing
Octane convenience subpath alone is not a functional gap.

## Choose the requested outcome

- **Audit or assess:** collect current evidence, assess consumer needs and
  reduction candidates, and deliver the refreshed report with finding IDs.
- **Update or reduce:** use an audit report and selected finding IDs to implement
  the bounded change below. An audit request alone does not authorize updates.
- **Copy or rewrite React implementation:** load
  [octane-react-library-port](../octane-react-library-port/SKILL.md). Its full
  port workflow applies to the implementation actually owned, including copied
  slices of mixed packages. New React-library ports start there directly.

Preserve the user's scope and existing authorization. Skill creation or workflow
evaluation does not authorize changes to real bindings. Do not restart a paused
campaign or reopen a closed PR merely because its files appear in an audit.

## Collect and assess

Read `AGENTS.md`, the selected binding's public exports and status, and
`docs/differences-from-react.md` for relevant behavior. Use the shared inventory
through the audit CLI; do not maintain a separate binding list. Read
[audit-evidence.md](references/audit-evidence.md) for report assessments and
baseline comparisons before relying on a report.

Run the audit script directly so package-manager auto-install cannot run lifecycle
scripts during an audit. Required tooling dependencies must already be available;
resolve missing setup separately before auditing.

Choose a report path outside every Git source tree, including worktrees and
ignored directories. For example, use an external temporary directory:

```bash
node scripts/bindings-audit.mjs audit --binding <name> --output <external-report.json>
node scripts/bindings-audit.mjs audit --binding <name> --binding <other-name> --output <external-report.json>
node scripts/bindings-audit.mjs audit --all --output <external-report.json>
```

Use one selection form. `--repository <url>` selects the intended Octane remote
when needed. Audit fetches isolated remote default-branch checkouts; the caller's
checkout is not the audit baseline. Record released package versions separately
from fetched default-branch SHAs. Audit collection does not create campaign nodes,
migrate matrices, change verification dates, or execute package scripts.

Assess each selected binding's supported behavior and unnecessary copied vanilla
source, bundles, and test snapshots. Inspect actual imports and consumer scenarios;
snapshot presence suggests a candidate, not permission to delete it. Classify
findings as `functional-gap`, `compatibility-defect`, `dependency-update`,
`metadata-drift`, `convenience-import`, `unverified-compatibility`, or
`reduction-candidate`. Functional gaps and compatibility defects require a concrete
consumer failure. Keep unresolved compatibility explicitly unverified.

Add evidence-backed assessments to the external report, preserving collected
facts. Before delivering findings, run the final fetch and report pass:

```bash
node scripts/bindings-audit.mjs report --input <external-report.json>
```

Audit/revalidate write JSON to stdout; report writes human output. Diagnostics go
to stderr. Exit 0 means collection and freshness completed, not proven
compatibility; 1 means invalid input or an unusable root baseline; 2 means partial
or stale evidence. Show incomplete bindings and affected findings accurately.

## Implement selected findings

Before edits or delegation, record a scope capsule containing:

- the consumer problem or concrete maintenance benefit and expected behavior;
- the report path, selected finding IDs, release identity, and baseline SHAs;
- owned files, validation commands, and explicit exclusions;
- for removal, candidate paths and the supported contracts and evidence to retain.

Refresh immediately before implementation:

```bash
node scripts/bindings-audit.mjs revalidate --input <external-report.json> --finding <id>
```

Repeat `--finding` for multiple selections. Compare relevant files in the actual
implementation checkout with the audit's file fingerprints, including missing,
new, and untracked files. A fresh remote alone does not validate local work. Resolve
differences by inspecting and reassessing against the current baseline; preserve
unrelated changes. Do not implement from failed acquisition, stale findings, a
changed source identity, or unresolved prior invalidation. Follow the reassessment
rules in the audit reference; timestamps or SHA edits alone cannot refresh proof.

Read [ownership-and-removal.md](references/ownership-and-removal.md) before
selecting evidence or deleting files. Use the shared observed-source policy:
ordinary dependencies retain identity, exports, public types, package consumption,
and focused integration checks; adapters add their owned lifecycle checks; copied
React work retains provenance, mapping, and pristine/adapted parity. Unknown or
legacy ownership keeps strict requirements until explicitly validated and migrated.

Implement the smallest change that meets the capsule. Preserve supported imports,
public types, behavior, applicable licenses, and relevant adapter tests. A request
for more wrapper imports does not justify copying an upstream tree. Before adding
unexpected vendored trees, bundles, shared-tool changes, or substantial growth,
reassess necessity and scope; ask only if the new work requires a missing decision
or authority. Continue already authorized routine work without permission loops.

Run the selected evidence, repair relevant failures in the owning package, and
refresh the selected findings again before delivery. Use `report --input ...
--finding <id>` for the final pass. If upstream advanced during implementation,
reassess affected conclusions and rerun affected checks against replacement
baselines. Keep intended implementation differences separate from baseline proof.

Independently review the actual diff against the original consumer problem and
capsule before committing or pushing. Passing checks do not justify unnecessary
files. Remove unrelated additions. Follow `create-a-pr` when shipping is authorized,
preserving authorization already given; the skill grants no extra shipping scope.

Deliver the report path and selected IDs, changed paths, observed checks, remaining
uncertainty, and current freshness. For reduction, report before/after file and byte
counts separately from runtime, types, lifecycle, package-consumption, and license
evidence. Claim only the compatibility actually demonstrated.
