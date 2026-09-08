# Dependencies and feasibility

Read this after the first preflight report and again after implementation for the
final shipped-closure audit.

## Live authority

Use the CLI inventory; do not maintain a package table in notes or skill prose.
It fingerprints and reads:

- canonical workspace/binding discovery from `scripts/workspace-packages.mjs`;
- `KNOWN_BINDINGS`, `KNOWN_VANILLA_CORES`, and `REACT_API_MAP` from the MCP bridge;
- live binding manifests, exports, upstream versions, `status.json`, and
  verification state;
- Octane public exports and `docs/differences-from-react.md`.

An existing binding is reusable only when its registered upstream package,
version lane, complete verification, and required package subpaths cover the
consumer. Otherwise schedule an evidence-backed extension of that package. Never
create a second binding under a different name.

## Binding names

Use each graph node's `binding` and `bindingDirectory` as the naming authority.
Existing registered mappings win and are extended in place. For a new binding,
remove a leading `react-` from the upstream package segment: `react-hookz`
becomes `@octanejs/hookz` in `packages/hookz`. Preserve a scope as a slug while
removing the same segment prefix, so `@tanstack/react-widget` becomes
`@octanejs/tanstack-widget` in `packages/tanstack-widget`. Names without that
leading segment remain intact.

A derived name already owned by a workspace package, a derived
`bindingDirectory` already occupied by any workspace package, or a name shared
by two batch nodes is a `binding-name-conflict` blocker. Resolve ownership
explicitly and rerun the graph; never restore `react-`, append an arbitrary
suffix, or overwrite the existing package to escape the collision.

## Classify from the shipped surface

Start with published runtime, optional, and peer dependencies. Inspect package
exports and shipped entry points/imports, not development checkout dependencies.
Exclude build, documentation, example, and test-only edges unless a public entry
point actually loads them.

Classify every unresolved runtime edge as exactly one of:

- `framework-neutral`: usable directly without React ownership. Confirm from
  shipped imports/API; then use `--classify package=framework-neutral`.
- `react-coupled`: exposes hooks, components, providers, React-owned lifecycle,
  or another React runtime dependency. Add it with `--prerequisite` at its
  required range and use `--classify package=react-coupled`. Preflight resolves
  a supported range to the highest exact stable published version and records it
  as a prerequisite rather than a user-requested target.
- `reimplemented`: the parent uses a bounded public behavior that can be
  independently re-authored without copying or adapting prerequisite source.
  Use this when that source cannot pass the approved-license gate but the public
  contract can be proven with differential parity tests. This satisfies the
  graph edge only; it grants no permission to inspect and copy unapproved code.
  Select this automatically when a non-requested React-coupled prerequisite
  fails source-copy or source-identity evidence. Never propagate that failure to
  the requested parent as a license blocker.
- `unsupported`: relies on React private internals, `react-reconciler`, a custom
  renderer, or a specific public behavior proven to require an absent Octane
  primitive. Use `--classify package=unsupported` and record the owning repair
  action. Do not use this classification for a large rewrite or class-based
  implementation.

Do not treat “vanilla,” “headless,” “core,” or a README claim as proof. Conversely,
do not port a package merely because its name contains `react` when the shipped
surface proves it is framework-neutral.

The bounded shipped-source scan reports React APIs, rewrites, class components,
private/internal hazards, and truncation. `bridgeable-with-rewrites` is an
implementation estimate: keep the node ready and execute its `feasibility.plan`.
Rewrite class components as functions, re-author `createElement`/`Children`
structures in `.tsrx`, and use refs as ordinary props. Rewrite size is not a
feasibility verdict.

`needs-rework` is reserved for a detected public React API with no Octane
implementation or documented rewrite. It, a truncated scan, or a nonempty
`hazards` list is a preimplementation feasibility blocker. A missing Octane
primitive becomes a blocker only after it is tied to specific required public
behavior and an owning repair. Treat `forwardRef`, refs, host events, SSR entry
points, and partial descriptor APIs according to the live bridge notes and
`docs/differences-from-react.md`.

## Read the graph

Each node names its constraints, `dependsOn`, action, state, blockers, repair,
and evidence/plan fingerprints. A ready node may set
`feasibility.requiresAdaptation` and carry a mandatory `feasibility.plan`.
The graph also assigns a disposition:

- `actionable`: implement now in an `actionableExecutionUnit`;
- `pending-intake`: recursively classify or preflight prerequisites, then rerun;
- `hard-blocked`: stop only this branch for proved policy/identity, collision,
  version, or true feasibility evidence;
- `satisfied`: reuse the already verified capability.

A top-level `pending-intake` status means preflight itself completed without a
hard failure but every requested branch still needs recursive dependency work.
It is not a portability verdict and is not local implementation readiness.

The preflight timeout message, HTTP 403/429 responses, and HTTP 5xx responses
are retryable intake failures, not immutable policy evidence. Keep them
`pending-intake`, retry through configured credentials and supported source
endpoints, and continue independent branches. Other HTTP failures, including
404, are permanent evidence failures unless a later preflight resolves a
corrected immutable source location; keep those `hard-blocked`.

Actions mean:

- `reuse-package`: consume a proven framework-neutral dependency directly;
- `reuse-binding`: use an adequate existing `@octanejs/*` package;
- `extend-binding`: close a real gap in that existing package;
- `create-binding`: implement one new binding after preflight;
- `binding-name-conflict`: resolve a derived package-name collision before any
  binding write;
- `audit-dependency` or `preflight-prerequisite`: supply missing evidence;
- `feasibility-blocker`: stop for truncated evidence, a concrete hazard, or a
  `needs-rework` public API without an Octane implementation/rewrite;
- `resolve-version-conflict`: stop the conflicting branch.

`audit-dependency` and `preflight-prerequisite` are mandatory recursive intake
work, not terminal outcomes. Inspect and classify them without asking the user
to substitute or drop the requested target. Escalate to the user only if the
completed evidence exposes a real policy block, incompatible version choice, or
scope decision.

Use `actionableExecutionUnits`, not whole-batch status, as the implementation
queue. A large dependency graph, high rewrite count, or another target's hard
block never prevents an independent actionable unit from starting.

Shared prerequisites appear once. Incompatible lanes name every dependent path;
never choose a version silently. Strongly connected nodes appear in one
`executionUnit`; keep the unit bounded or block it with an explicit split/repair.
Execute units in the reported order. A blocked prerequisite propagates only to
its dependents.

## Worktree ownership

The batch manifest captures paths already changed at intake. Before each unit:

1. derive the exact package and generated paths it may write;
2. compare them with `baseline` and current `git status`;
3. ignore unrelated dirty paths but never reset, stage, or reformat them;
4. if a planned path overlaps, prove its upstream identity, license, and intended
   owner; when they match, rerun preflight with `--adopt-binding` and continue
   without asking the user;
5. record adopted paths in the node evidence before continuing.

`--adopt-binding` is accepted only when the occupied binding's structured
`status.json` records the same upstream package, exact version, immutable commit,
and approved SPDX license as the preflight node. A batch-derived name collision,
an unrelated workspace package/path, or incomplete/mismatched provenance is not
adoptable and remains a terminal ownership conflict.

Re-run the graph whenever identity, dependency classification, existing binding
status/exports, Octane public capability, or planned source boundaries change.

## Final closure audit

Before `verified`, inspect the binding's actual runtime imports and every copied
or adapted file. Compare that closure with the planned graph. New React-coupled
edges return to preflight; newly reused cores return to classification and
license/package review. Remove stale graph edges only with evidence. This second
pass prevents the initial manifest audit from standing in for the code that
actually ships.
