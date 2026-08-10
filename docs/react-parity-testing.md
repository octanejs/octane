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

`react-parity:validate` checks manifest schemas and hashes, inventories,
generated coverage, environments, and public claims. It does not collect or
execute Vitest, Jest, or type-test lanes.

The generic `react_parity_checks` job runs the complete package suites on Node
24:

```bash
pnpm react-parity:check
```

The ordinary test matrix uses `vitest.ci-sharded.config.js`. Do not add:

- a package-specific parity job;
- a package path to `.github/workflows/ci.yml`;
- a package-specific exclusion environment variable;
- another full execution of a parity-owned project in the ordinary shards.

The parity harness executes every available required lane and uses each runner's
JSON report to verify that every declared file and test identity passed exactly
once. It does not run a separate Vitest collection pass before execution.
`harness.mjs validate` retains collection for an explicit validation-only check.

## Adding or changing a binding

1. Define the complete local project and its aliases/setup in
   `vitest.config.js`. Put differential tests and their `globalSetup` in a
   separate, non-overlapping project.
2. Add `testExecution: { group: 'react-parity' }` when the whole project belongs
   to parity, or add `include` with only the parity-owned file patterns when the
   project is mixed.
3. Add or update `packages/<name>/audit/react-parity.json`; do not add the
   package to the workflow.
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
