# React parity test execution

This is the configuration contract for executable React-parity evidence in
`@octanejs/*` bindings. It complements the behavioral methodology in
[Validating Octane via real React libraries](./react-library-compat-plan.md) and
the generated [React parity coverage report](./react-parity-coverage.md).

The goals are:

- every required parity lane executes in the dedicated React parity job;
- parity-owned Vitest work is not repeated by the ordinary Node-version shards;
- package-authored conformance tests remain in the ordinary shards;
- adding another binding does not add a package path or job to `ci.yml`.

## Project configuration

Define the normal local Vitest project in `vitest.config.js`. Add repository
metadata named `testExecution` to identify the files owned by a dedicated
execution group.

When the group owns the entire project, omit `testExecution.include`:

```js
{
	testExecution: { group: 'react-parity' },
	test: {
		name: 'example-pristine',
		include: ['packages/example/tests/upstream-original.test.ts'],
	},
}
```

When one Vitest project contains both parity evidence and ordinary package
tests, list only the parity-owned patterns in `testExecution.include`:

```js
{
	testExecution: {
		group: 'react-parity',
		include: [
			'packages/example/tests/upstream/**/*.test.ts',
		],
	},
	test: {
		name: 'example',
		include: ['packages/example/tests/**/*.test.ts'],
		exclude: ['packages/example/tests/differential/**/*.test.ts'],
	},
}
```

`testExecution.include` states ownership; it does not describe a CI
implementation. Do not put shard names, Node versions, workflow job names, or
the complementary conformance patterns there.

The interpretation is generic:

| Project metadata | Local `vitest.config.js` | General sharded config |
| --- | --- | --- |
| no `testExecution` | complete project | complete project |
| `group`, no `include` | complete project | project omitted |
| `group` plus `include` | complete project | group-owned patterns added to `test.exclude` |

[`vitest.ci-sharded.config.js`](../vitest.ci-sharded.config.js) reads this
metadata and derives the ordinary-shard view. It also removes `testExecution`
from the project passed through that config. The base config remains the
canonical local project: `pnpm vitest run --project <name>` still sees every
file in its normal `test.include`.

Use separate Vitest projects when tests genuinely require different
environments, transforms, or preparation, such as pristine Jest evidence,
adapted DOM tests, differential tests, and server-mode compilation. Mark each
fully group-owned project with the same `testExecution.group`.

A package that commits `audit/upstream.lock.json` commits its pinned pristine
`upstream/` tree byte-exact; the lock records each file's upstream git blob
sha, so the committed copy verifies offline against the pinned upstream
commit. Its adapted `tests/upstream/` suite is regenerated, never committed:
`scripts/react-parity/check.mjs` runs `pnpm react-port:materialize run`
(verify pristine, then rebuild adapted from the lock's mechanical rewrites
plus the committed divergence patches) before any verifier, contract walk, or
lane reads those paths. Derived adapted copies are never tracked; only
genuinely re-authored port-authored suites live in the repository. Regeneration fails closed if an adapted module
still imports `react`, `react-dom`, or `@testing-library/react`, so a missed
rewrite or a patch that reintroduces a React specifier is rejected inside this
gate rather than surfacing at test time. The whole flow is offline. Manifest lanes for such a
package cite only committed artifacts (the lock, patches, skip rationales,
inventories, and wrapper tests), never regenerated files. Registry-sourced
evidence (published declarations, dist output, tarballs) lives under
`upstream-artifact/`, outside the lock, hash-pinned per package.

Per-package parity plumbing is configuration first, scripts second. Pure-data
provenance checks live in `audit/provenance.json`, executed by the shared
`scripts/react-parity/verify-provenance.mjs` (lock check first, then artifact
hashes, required files, license equalities, package identity, export-condition
mirroring). Pristine runners register in `scripts/react-parity/run-pristine.mjs`
and, when Vitest-shaped, are themselves driven by `audit/pristine-suite.json`
through `pristine-suite-lib.mjs`. Per-package scripts remain only for bespoke
contracts — crosswalk derivation, case-structure digests, manifest generators —
and any such generator must itself emit every evidence row the committed
manifest carries, so regeneration reproduces it byte-for-byte.

Differential tests must have their own project because their React-side fixture
compilation and cache preparation do not belong to the full adapted suite:

```js
{
	testExecution: { group: 'react-parity' },
	test: {
		name: 'example-differential',
		include: ['packages/example/tests/differential/**/*.test.ts'],
		environment: 'jsdom',
		globalSetup: ['packages/example/tests/differential/_setup.ts'],
	},
}
```

Exclude the differential patterns from every broader project whose `include`
would otherwise match them. Do not attach differential `globalSetup` to the
adapted-suite project, run the preparation from each test file, or serialize or
cap the adapted suite's workers to accommodate differential setup. Leave worker
selection to Vitest unless measurements establish a project-specific reason to
override it.

## Manifest and project ownership

Each binding parity manifest lives at
`packages/<name>/audit/react-parity.json`. `pnpm react-parity:check` discovers
these manifests automatically; the workflow must not enumerate packages.

For each Vitest-backed lane:

- `lane.project` must equal the corresponding `test.name` in
  `vitest.config.js`;
- every lane file must be covered by the project's normal `test.include`;
- every parity-owned Vitest file must be covered by `testExecution.include`, or
  the project must be wholly owned by omitting that field;
- package-authored conformance or framework-contract tests that are not parity
  evidence must stay outside `testExecution.include`.

Only required, available lanes can claim files. Optional or unavailable lanes
do not justify removing a file from ordinary CI. Static validation discovers
the files selected by every `react-parity` project and requires exact set
equality:

```text
files claimed by required available lanes = files owned by testExecution
```

A claimed-but-unowned file can run in both CI paths. An owned-but-unclaimed file
has no parity executor and disappears from ordinary CI. Both are validation
failures, as are a missing live project, evidence excluded by the live project,
stale sharded output, and a duplicate `(project, file, fullName)` claimed by two
required lanes.

### Execution proof chain

A config hash is not parity evidence. It proves only that the config's bytes
have not changed, and harmless edits invalidate it without proving selection or
execution. Do not list `vitest.config.js` as a manifest support file.

The executable contract uses each source for what it can authoritatively prove:

| Claim | Authority |
| --- | --- |
| Inputs are unchanged | hashes for tests, fixtures, setup, inventories, and upstream records |
| The lane selects real tests | the manifest plus the live Vitest project |
| The parity job owns exactly those files | equality with `testExecution` ownership |
| Ordinary CI keeps the complement | the derived `vitest.ci-sharded.config.js` project |
| The declared observations ran once and passed | the runner's exact JSON identity multiset |

Passing declared observations provides the behavioral evidence. The contract
proves only those declared cases and full-suite inventories; it does not claim
that every possible React behavior is covered.

A full-suite lane gets its file and identity sets from the committed inventory,
while the live project remains the runner configuration source:

```json
{
  "id": "example-adapted-full-suite",
  "project": "example",
  "oracle": "required",
  "execution": {
    "kind": "vitest-full",
    "inventory": "packages/example/audit/adapted-runtime.json"
  }
}
```

Direct TypeScript, Jest, Node, and Playwright lanes retain their declared
runners. When a direct runner replaces a Vitest wrapper, list that wrapper as
lane evidence and give the matching live project `react-parity` ownership. The
static contract then removes the wrapper from ordinary shards without treating
it as another Vitest execution:

```js
{
	testExecution: { group: 'react-parity' },
	test: {
		name: 'example-pristine',
		include: ['packages/example/tests/upstream-original.test.ts'],
	},
}
```

```json
{
  "id": "example-pristine-upstream",
  "project": "example-pristine",
  "oracle": "required",
  "execution": { "kind": "jest-full", "config": "...", "root": "...", "inventory": "..." },
  "files": [
    {
      "path": "packages/example/tests/upstream-original.test.ts",
      "role": "support",
      "sha256": "..."
    }
  ]
}
```

A measured `vitest-full` lane may set `execution.fileParallelism`. The
parity-wide Vitest configuration applies that setting to the selected project
while keeping the exact inventory under harness control. Keep the field absent
unless a repeatable project-specific measurement justifies it; leave worker
sizing to Vitest unless the project has separate evidence for a fixed bound.

TypeScript and pristine Jest lanes are still declared in the manifest even
though they are not selected through a Vitest project. A Vitest wrapper around
an already-executed pristine Jest suite is not another oracle and should not be
run again in the ordinary shards.

Structured divergences that pin unpaired Octane-only ordinary-shard cases must
not invent a required parity lane for identity alone. Declare those cases under
optional `ordinaryEvidence` (path, sha256, and `@parity-case` identities) so the
ledger can bind `divergences[].caseIds` without counting them as React evidence
or re-executing them under `react-parity:check`.

## CI execution

The always-on lint job covers the cheap control plane, including lightweight
documentation changes:

```bash
pnpm react-parity:test
pnpm react-parity:validate
```

`react-parity:validate` checks manifest schemas and direct evidence hashes,
inventories, generated coverage, environments, public claims, live project
selection, exact file ownership, the derived shard view, and cross-lane
identity uniqueness. It does not collect or execute Vitest, Jest, or type-test
lanes.

The generic React parity workers run the complete package suites on Node 24. CI
currently requests four native Vitest file shards:

```bash
pnpm react-parity:check --shard 1/4
pnpm react-parity:check --shard 2/4
pnpm react-parity:check --shard 3/4
pnpm react-parity:check --shard 4/4
```

`pnpm react-parity:check` without `--shard` retains the complete single-runner
local view. The workflow's stable `React parity checks` aggregate succeeds only
after every worker succeeds.

The ordinary test matrix uses `vitest.ci-sharded.config.js`. Do not add:

- a package-specific parity job;
- a package path to `.github/workflows/ci.yml`;
- a package-specific exclusion environment variable;
- another full execution of a parity-owned project in the ordinary shards.

The parity harness executes every available required lane and uses each runner's
JSON report to verify that every declared file and test identity passed exactly
once. It does not run a separate Vitest collection pass before execution.
`harness.mjs validate` retains collection for an explicit validation-only check.
Each shard completes metadata and environment preflight for every manifest
before it starts expensive work. Vitest applies its native path-hash sharding to
the combined parity file set, so a lane may span workers and a new suite needs no
timing-ledger update. Each worker uploads its validated subset report; the stable
aggregate merges all reports and rechecks every required lane's complete exact
identity inventory. Increasing the shard total therefore changes only the CI
matrix and `--shard` coordinates, not package metadata.

Within a shard, the harness narrows every selected Vitest-backed project to its
manifest-owned files and test names and executes the native file subset through
one Vitest process. One scheduler therefore sizes workers for that runner
instead of starting a new scheduler for every lane. Selected non-Vitest type and
custom-runner lanes execute afterward without overlapping Vitest's worker pool.
They retain a deterministic structural plan based on declared work, with each
manifest assigned whole to one shard. Their manifest queue is bounded by the
CPUs available to the process; each child is internally single-process
(`tsc`/Node, Jest `--runInBand`, or one Playwright worker), so the queue does not
multiply nested worker pools.

`playwright-full` lanes must use a lockfile-backed dependency workspace under
`scripts/react-parity/fixtures/`. The shared runner links that already-installed
workspace into its temporary application; it must not run a nested package
install or install another browser revision. When the upstream application has
its own committed manifest and lockfile, declare them as `dependencySource` and
let `pnpm sync` generate the active fixture instead of copying dependency
versions by hand. Active workspace declarations use the default Playwright
catalog, and the workspace override keeps transitive `playwright` and
`@playwright/test` consumers on that same revision. Historical package manifests
copied into an `upstream/` tree remain immutable evidence and are not themselves
active workspace declarations.

Differential fixtures must preload both runtime modules at the test-module
boundary, before the first timed case. `globalSetup` compiles the React-side
fixture, but the first dynamic import can still traverse a large oracle package
graph. Await that one-time work during collection so a slow import cannot consume
an individual case's timeout and leave React's `act()` queue half-open:

```ts
await Promise.all([
	preloadDifferentialFixture(FIXTURE, CACHE),
	preloadDifferentialFixture(SECOND_FIXTURE, CACHE),
]);
```

Use concurrent preloads only when fixture module evaluation order is independent.
A custom rig whose modules allocate process-global identities must await each
runtime pair in test order. `react-parity:test` verifies that every required
differential mount fixture/cache pair, including package-specific rigs, has a
matching top-level awaited preload.

## Adding or changing a binding

1. Define the complete local project and its aliases/setup in
   `vitest.config.js`. Put differential tests and their `globalSetup` in a
   separate, non-overlapping project.
2. Add `testExecution: { group: 'react-parity' }` when the whole project belongs
   to parity, or add `include` with only the parity-owned file patterns when the
   project is mixed.
3. Add or update `packages/<name>/audit/react-parity.json`; do not add the
   package to the workflow or hash `vitest.config.js` as support evidence.
4. Refresh hashes and inventories with the package's parity tooling. Run
   `pnpm react-parity:lockfiles:generate` after an intentional lockfile change;
   the root `pnpm sync` command also runs this generator.
5. Prove both views:

   ```bash
   pnpm vitest run --project <project> <representative-local-file>
	pnpm vitest run --config vitest.ci-sharded.config.js --project <project>
	node scripts/react-parity/harness.mjs validate --lane <full-runtime-lane>
	pnpm react-parity:validate
	pnpm react-parity:test
	pnpm react-parity:check
   ```

6. Run `pnpm ci:workflow:test`. Its regression coverage verifies that the
   workflow stays package-agnostic, fully owned projects disappear from the
   ordinary shards, and mixed projects retain only their non-parity tests.
