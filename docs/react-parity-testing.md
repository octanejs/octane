# React parity test execution

This is the configuration contract for executable React-parity evidence in
`@octanejs/*` bindings. It complements the behavioral methodology in
[Validating Octane via real React libraries](./react-library-compat-plan.md) and
the generated [React parity coverage report](./react-parity-coverage.md).

The goals are:

- every changed pristine React lane and every required Octane lane executes in
  the dedicated React parity jobs;
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
		name: 'example-server',
		include: ['packages/example/tests/**/*.server.test.ts'],
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
			'packages/example/tests/differential/**/*.test.ts',
		],
	},
	test: {
		name: 'example',
		include: ['packages/example/tests/**/*.test.ts'],
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
file in its normal `test.include`. The supported root and package `pnpm test`
commands go through the generic test runner, which refreshes relevant stale
pristine receipts before starting Vitest. Direct `vitest` execution is the
lower-level, non-receipt-aware escape hatch.

Use separate Vitest projects only when the tests genuinely require different
environments or transforms, such as adapted DOM tests and server-mode
compilation. Mark each fully group-owned project with the same
`testExecution.group`. Pristine Jest and TypeScript lanes run directly through
their manifest execution adapters and need no Vitest wrapper project.

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

TypeScript and pristine Jest lanes are still declared in the manifest even
though they are not selected through a Vitest project. A Vitest wrapper around
an already-executed pristine Jest suite is not another oracle and should not be
run again in the ordinary shards.

## Pristine React receipts

Every package with required `pristine-upstream` or `pristine-types` lanes has a
generated, committed receipt beside its manifest:

```text
packages/<name>/audit/react-parity.receipts.json
```

Each lane records one SHA-256 input fingerprint, not a hash of logs or DOM
output. The receipt is written only after that exact lane passes. A failed or
interrupted lane never updates it.

Packages do not declare a dependency list for this hash. The generic collector
derives the boundary from what the lane actually executes:

- the manifest lane, evidence files, runner, configuration, inventory, and
  pinned upstream source;
- Jest's resolved configuration plus package imports found in its source
  boundary;
- TypeScript's resolved `--listFilesOnly` input set for pristine type lanes;
- the resolved transitive pnpm-lock subgraph for those discovered packages;
- the receipt and harness implementation and the exact pinned Node version.

The whole lockfile is deliberately not hashed. An unrelated dependency must not
invalidate every binding receipt. OS and architecture are also excluded;
pristine evidence is certified on the manifest's exact Node version, currently
Node `24.18.0`.

Receipt generation is private to the generic test runner. `pnpm test` discovers
all package manifests; `--ported-libs` scopes the run to package directories and
their discovered manifests without exposing internal Vitest project names.
Current lanes are skipped, while missing or stale lanes run and rewrite the
tracked receipt. Packages do not import the receipt implementation or pass
manifest paths. Commit any generated receipt change:

```bash
pnpm test
pnpm test --ported-libs <name>
```

Direct Vitest, parity harness, and CI execution never rewrite a receipt.

## CI execution

CI treats a committed receipt as a claim, not proof. The generic Node
`24.18.0` planner validates every manifest and receipt, recomputes the hashes,
and looks for a previous successful `React parity provenance` check with the
identical package/lane/hash tuple. An unchanged proven pristine lane is
inherited. A new or unproven hash runs again in CI. Missing GitHub provenance
fails open to execution.

The dynamic execution matrix is grouped per discovered package so packages can
run in parallel without appearing in the workflow. In phase one, adapted type,
client, server, focused, and differential lanes remain in every package matrix;
only pristine React runtime and type lanes can be inherited. The stable `React
parity provenance` aggregate succeeds only after every current pristine hash is
inherited or executed and every non-receipted lane passes.

A missing, malformed, or stale committed receipt fails the planner and directs
the contributor to the owning package test. CI never edits or commits receipts.

The ordinary test matrix uses `vitest.ci-sharded.config.js`. Do not add:

- a package-specific parity job;
- a package path to `.github/workflows/ci.yml`;
- a package-specific exclusion environment variable;
- another full execution of a parity-owned project in the ordinary shards.

The parity harness executes all selected lanes for one package in a single
process. Running each lane through a fresh harness process defeats its collected
project cache and is a performance regression.

## Adding or changing a binding

1. Define the complete local project and its aliases/setup in
   `vitest.config.js`.
2. Add `testExecution: { group: 'react-parity' }` when the whole project belongs
   to parity, or add `include` with only the parity-owned file patterns when the
   project is mixed.
3. Add or update `packages/<name>/audit/react-parity.json`; do not add the
   package to the workflow.
4. Refresh inventories with the package's parity tooling, then run the ported
   library tests and commit the automatically generated receipt:

   ```bash
   pnpm test --ported-libs <name>
   ```

5. Prove both views:

   ```bash
   pnpm vitest run --project <project> <representative-local-file>
   pnpm vitest run --config vitest.ci-sharded.config.js --project <project>
   node scripts/react-parity/harness.mjs validate --lane <full-runtime-lane>
   pnpm react-parity:test
   pnpm react-parity:check
   ```

6. Run `pnpm ci:workflow:test`. Its regression coverage verifies that the
   workflow stays package-agnostic, fully owned projects disappear from the
   ordinary shards, and mixed projects retain only their non-parity tests.
