# Ownership, evidence, and removal

Read this before selecting update validation or deleting redundant material.
`scripts/binding-surface-policy.mjs` is the shared contract; do not create a second
ownership classifier in the skill or a package-specific bypass.

## Validate the actual surface

Optional `status.json.surfaces` entries identify `entrypoint`, `exports` selectors,
`ownership` (`imported`, `adapter`, or `copied`), package-relative `files` and
`evidence`, and `dependency` identity (`package`, `version`, optional `specifier`).
Copied entries also name scoped `upstreamPaths` and need matching hashed adapted
provenance in the source ledger. Dependency versions must match package metadata
where required; declarations do not establish that evidence passed.

Use `readBindingSurfacePolicy(packageDirectory, { sourceLedger })` or
`assertBindingSurfacePolicy` from the shared module and inspect its issues.
Imported surfaces must be actual direct dependency re-exports, with no owned
runtime statements hidden in their files. Each adapter runtime export must show
actual Octane integration; associated erased types cannot justify unrelated local
runtime implementations. All public exports and reachable source must have
unambiguous ownership. Unparsed, conflicting, unknown, or incomplete coverage is
not permission to relax evidence. Missing policy retains legacy strict behavior.

| Observed ownership | Required evidence |
| --- | --- |
| Imported dependency/re-export | Dependency and release identity, normal license/package review, supported exports, precise public types, authored/packed consumer checks, focused integration behavior. No mandatory copied upstream tree or full pristine/adapted suites. |
| Octane adapter | Imported obligations plus owned hooks, effects, subscription identity, update/disposal cleanup, lifecycle, SSR/hydration, and browser behavior as applicable. |
| Copied or rewritten React | Approved copy license, immutable provenance, source ledger, scoped lock, mappings/crosswalk, pristine/adapted runtime and type lanes for the owned implementation. Follow the full port skill. |
| Mixed | The union for its actual surfaces; retain copied-slice evidence and adapter tests while removing only proven imported-surface obligations. |

For actual copied/rewritten React work, read the
[port implementation reference](../../octane-react-library-port/references/implementation-and-evidence.md).
An import wrapper or an authored lifecycle fix alone does not warrant a new port
campaign. If a campaign already exists, preserve its ownership/state and use its
explicit selected-node migration; do not initialize or advance one during audit.

## Migrate consumers before deleting inputs

Inventory candidate trees and their consumers before removal: source imports,
package exports and published files, locks, ledgers, provenance configs, patches,
registration inventories, crosswalks, parity manifests, pristine/adapted lanes,
type programs, test discovery, package scripts, inventory/status generators, and
aggregate validation callers. The audit's `referencesToMigrate` is a starting list;
inspect dynamic paths too. A deleted tree must not be regenerated or required by a
remaining shared caller, and a retained copied slice must not lose coverage.

First establish current ownership and the replacement consumer/adapter evidence.
Remove or narrow only the obligations that this proof makes obsolete. For an
already-initialized, authorized `implementing` node, write a closure with the actual
current source ledger and run:

```bash
pnpm react-port:evidence migrate --batch <id> --node pkg:<name> --closure <closure.json>
```

The closure includes actual `runtimeDependencies`, `adaptedSources`, `sourceLedger`,
and `reimplementedDependencies`. Ledger entries cover current reachable files with
package-relative `path`, exact byte `sha256`, and `origin: "authored"` or
`"adapted"`; adapted entries also identify `packageName`. Migration keeps immutable
identity, resets source-dependent evidence including generated-data/format passes,
and does not make a node verified or advance a campaign. It requires a valid
declared policy; never hand-edit matrix gates to waive evidence. Each subsequent
record/run/verify compares the current policy fingerprint, so migrate again after
relevant files change before recording new results. Do not substitute a planned
future ledger for existing source or manipulate a paused node's state to migrate.

For mixed locks, narrow materialization inputs to retained copied `upstreamPaths`
plus required license/notice files before regeneration. Keep matching copied
source-ledger entries, mappings, crosswalk and parity lanes. For imported-only
surfaces, remove obsolete lock/provenance/lane consumers together once replacement
checks exist. Update inventory and generator inputs and exercise affected aggregate
entrypoints. Removing a directory alone does not prove its evidence is obsolete.

Delete only proven-redundant files, then run the applicable package, type,
consumption, parity, inventory, materialization, and generated-data checks. Retain
existing applicable license/notice attribution; an ordinary dependency with its
own shipped license does not require creating a new copied license snapshot.
Recheck the actual import/export closure and clean-checkout discovery so removal
cannot silently skip retained tests or regenerate removed trees.

Measure before/after tracked files and bytes over the same declared boundary.
Report those counts separately from runtime behavior, precise types, lifecycle,
package consumption, and license evidence. Smaller output alone is not proof that
the supported consumer contract survives.
