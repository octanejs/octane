# Implementation and evidence

Read this only after a node is `ready`. Keep implementation inside that node's
package/output boundary and keep its evidence independently reviewable.

## Choose the owning change

- `reuse-package`: add only the ordinary dependency and thin Octane surface that
  is genuinely needed. Do not copy a working framework-neutral core.
- `reuse-binding`: change no binding code unless the consumer proves a gap.
- `extend-binding`: work in the registered package and add regression/parity
  evidence for the missing surface.
- `create-binding`: create the exact graph-reported `binding` at its
  `bindingDirectory`, following the closest current binding shape and workspace
  conventions.
- `adopt-binding`: continue a provenance-matched partial package in place and
  record the adopted paths in its evidence. Adoption is part of the safe local
  workflow, not a separate user choice.
- `reimplement-in-parent`: copy no prerequisite source. Re-author only the
  public behavior the parent consumes. Do not vendor its tests; author
  independent differential scenarios from the public contract and prove the
  parent-visible behavior through the parity lanes and crosswalk. For a no-copy
  dependency, ignore or remove all source-derived plans, code, snippets, tests,
  and fixtures before authoring. Work only from its public contract and
  independently observed behavior.
- Core/compiler/scheduler/SSR/hydration/build defects belong to their owning
  Octane package. Load `octane-core-extend` and `performance-audit` before those
  edits and retain the real binding scenario as end-to-end evidence.

Load `authoring-tsrx` before writing `.tsrx`. Read a nearby authored file and
`docs/differences-from-react.md`; React-shaped intuition is not enough here.
Treat the graph's `feasibility.plan` as required work. A
`bridgeable-with-rewrites` verdict, class-component architecture,
`createElement`, or `Children` traversal does not reduce the surface that must be
ported: translate lifecycle/state into hooks and re-author element construction
and traversal as authored `.tsrx` components. A `needs-rework` verdict means the
scan found a public API with no implementation or documented rewrite; route that
primitive before implementation. If implementation discovers another such
public behavior, stop that node and route the primitive to its owning package.
Do not estimate portability from rewrite volume. Re-author the complete pinned
surface, then use the pristine/adapted runtime and type lanes plus the upstream
crosswalk to prove one-for-one observable functionality.

## Pin and materialize the upstream boundary

Inspect both the verified npm artifact and the canonical repository at the
preflight commit. The registry may omit source, tests, fixtures, or build
configuration; record which immutable artifact supplies each boundary.

The pinned upstream tree is committed byte-exact and verified offline against
its own content addresses; the adapted suite is regenerated, never committed.
For a new or upgraded port:

- derive the committed pin from the preflighted batch node:

  ```bash
  pnpm react-port:materialize lock --batch <id> --node pkg:<name> \
    --package-dir packages/<binding> \
    --adapted-map <pinned-test-root>=tests/upstream \
    [--adapted-rewrite <find>=<replace> ...]
  ```

  This writes `packages/<binding>/audit/upstream.lock.json`: the exact package
  identity, approved-license evidence hashes, the git blob sha and size of
  every file in the pinned source subtree, and the ordered mechanical
  `adaptedRewrites` (import repointing and similar package-wide conversions).
  The lock is the durable provenance artifact; commit it, and it fails closed
  on any fingerprint drift.

- commit the pristine tree under `packages/<binding>/upstream/`, byte-exact.
  Its integrity is machine-checked against the lock's git blob shas — the same
  hashes `git ls-tree -r <commit>` reports in the upstream repository — so
  verification never needs the network and any reviewer can audit the copy
  against `github.com/<owner>/<repo>/blob/<commit>/<path>`. On first
  materialization (`run` with no committed tree) the CLI fetches the pinned
  commit archive, verifies every byte before writing, and the result is what
  you commit. Keep the tree prettier-ignored and outside published `files`.

- regenerate the adapted suite whenever it is needed:

  ```bash
  pnpm react-port:materialize run --package-dir packages/<binding>
  ```

  With a committed pristine tree this is fully offline: it verifies the tree
  against the lock, then rebuilds the `tests/upstream` targets by copying each
  mapped pristine file, applying the lock's mechanical rewrites, and applying
  its committed divergence patch from `audit/upstream-patches/`. `run --check`
  verifies without writing. Materialization also fails closed if any
  regenerated adapted module still imports `react`, `react-dom`, or
  `@testing-library/react` — the rewrites remove those specifiers, and a patch
  cannot reintroduce one — so the adapted suite provably executes against
  Octane. Add a package `.gitignore` with `/tests/upstream/`;
  the regenerated adapted suite is never committed.

- author the adaptation by editing the regenerated `tests/upstream` files, then
  record it:

  ```bash
  pnpm react-port:materialize diff --package-dir packages/<binding>
  ```

  This regenerates `audit/upstream-patches/` with one patch per diverging file.
  Keep patches minimal: express every mechanical conversion as a lock
  `adaptedRewrite` or project configuration (Vitest `globals`, `setupFiles`,
  resolver aliases) so a mapped file with no behavioral divergence needs no
  patch at all, and the remaining hunks read as exactly the intentional
  divergences with their `// OCTANE DIVERGENCE[...]` rationale. Do not add
  per-case citation comments, renamed functions, or reformatting to adapted
  files; provenance lives in the lock and the patch. A pinned upstream case
  that must not run in the adapted lane gets a `<target>.skip` marker beside
  its patch path whose content is the durable rationale; a silently missing
  adapted file fails `diff`.

- mirror the upstream module layout in `src/` so source-to-port review and the
  next pinned upgrade have a mechanical crosswalk, and work module by module
  from the materialized pinned source, not declarations, README prose, or
  memory;

- record every published React entry-point export in `UPSTREAM.md` as ported,
  reused from a framework-neutral core, intentional divergence, inapplicable,
  or an explicit gap with evidence.

Evidence that comes from the npm registry rather than the git tree (a published
declaration bundle, compiled dist output, or the tarball itself) lives under
`packages/<binding>/upstream-artifact/`, prettier-ignored and outside published
`files`, hash-pinned by the package's provenance config or verifier — never
mixed into the lock-verified `upstream/` tree. The lock owns git bytes; the
artifact directory owns registry bytes.

A tracked suite under `tests/upstream/` is legitimate only for genuinely
re-authored, port-authored evidence (a different harness, per-case citations,
independently written scenarios). If the adapted files are derived copies of
the pinned upstream tests — the same files with converted imports, renamed
APIs, and scattered edits — they must be regenerated from the lock instead:
mechanical conversions as `adaptedRewrites`, divergences as patches, tracked
copies deleted. Patch hunks must be pure divergence in the pristine tree's own
formatting: no reformatting, no wrapping changes, no `as any` shortcuts where
Octane's native-event or ref-as-prop typing expresses the contract precisely.

Keep the committed pristine tree genuinely pristine:

- Never re-lock drifted bytes. If a vendored file differs from the pin (an
  appended newline, a rewritten header, an edited manifest), restore the true
  bytes and move the adaptation somewhere honest: a lock `adaptedRewrite`, test
  configuration, or a file the runner emits into its scratch tree.
- Repo-authored helpers must not masquerade inside `upstream/`. A shim the
  pristine lane needs (a `.js` re-export for a `.ts` authority, a fixture the
  monorepo root provided) is emitted by the runner at run time or regenerated
  from the lock, not committed among pinned files.
- Pinned snapshots whose header a modern Jest rejects stay byte-exact in
  `upstream/`; map the snapshot directory with `--adapted-map` plus an
  `--adapted-rewrite` for the header, point Jest at the regenerated copies with
  a `snapshotResolver`, and have the Jest config materialize them at load when
  absent so a clean checkout works offline.

Materialization does not move the license boundary. The lock and especially the
patches are derived from upstream bytes, so they stay inside the approved-license
gate: committing a patch is committing an adaptation. If immutable pin evidence
cannot be established, block the port instead of silently reducing its claimed
surface. Never point the pristine or adapted lanes at an unpinned checkout.

Existing bindings that predate the lock keep their committed
`packages/<binding>/upstream/` and `tests/upstream/` trees plus ledger
machinery as valid evidence. Migrate a legacy binding to the lock model when
you next touch its pin. Many published pins lack the registry `gitHead`
preflight requires; for those, derive the lock from the binding's existing
reviewed `UPSTREAM.md` pin:

```bash
pnpm react-port:materialize lock --package-dir packages/<binding> \
  --pin <name>@<exact-version> --repo <owner>/<repo> --commit <40-sha> \
  [--subdir <path>] --adapted-map <pinned-test-root>=tests/upstream
```

Pin mode still fails closed: the pinned commit's own manifest must declare
exactly the pinned name and version, and the pinned tree must carry
recognizable approved-license evidence. A migration keeps (or completes) the
committed pristine tree so it verifies against the new lock, retains the
upstream license as a hash-matched `LICENSE.upstream`, re-derives the adapted
suite as pristine bytes plus lock rewrites plus minimal divergence patches
(the pristine/adapted identity inventories are the safety net while
rewriting), deletes the superseded per-package SHA-ledger machinery, and swaps
the parity manifest's ledger support files for the lock and patches.
`scripts/react-parity/check.mjs` regenerates and verifies every package that
commits an `audit/upstream.lock.json` before its verifiers and lanes run.

## Prefer configuration over per-package scripts

Reach for the shared, config-driven machinery before writing a package script;
a new script is the escape hatch, not the default:

- **Provenance checks that are pure data** — artifact hashes, required files,
  license equalities/inclusions, package identity, export-condition mirroring,
  unpublished-dir guards — go in `packages/<binding>/audit/provenance.json`,
  executed by `node scripts/react-parity/verify-provenance.mjs` (schema in
  `provenance-manifest-lib.mjs`). The lock check always runs first. Wire the
  package's `upstream:verify`/`upstream:check` script to the shared CLI and
  cite `audit/provenance.json` in the parity manifest.
- **Pristine runners** register in `scripts/react-parity/run-pristine.mjs`
  (package name → runtime module + label); package scripts call
  `node ../../scripts/react-parity/run-pristine.mjs <package>`. Vitest-shaped
  runners should themselves be config-driven via `audit/pristine-suite.json`
  and the shared `pristine-suite-lib.mjs` engine; a hand-written runtime module
  is for genuinely foreign harnesses (bun, JUnit, Playwright applications).
- **Bespoke contracts stay scripts**: export crosswalks derived from a
  TypeScript program, case-structure digests, title-replacement maps,
  disposition inventories, and manifest generators encode judgment, not data.
  Keep them per-package, but source their byte verification from the lock and
  their pure-data checks from `provenance.json`.

Any generator that rebuilds `audit/react-parity.json` or another committed
inventory must emit the lock citation (and every other evidence row this model
adds) itself, so a regeneration run reproduces the committed file byte-for-byte;
hand-inserting a row a generator later drops is a review finding. After editing
generated-or-hashed artifacts, always format first, then rehash, then re-verify
stability — prettier restyling after hashing is the classic way to break a
manifest.

## Package contract

A completed publishable binding normally has:

- `package.json` with `@octanejs/*` name, Node baseline, public publish config,
  repository directory, truthful files/exports, package scripts, and the
  repository's MIT license for binding-authored work;
- exact workspace `octane` peer and dev dependencies, never a regular runtime
  `octane` dependency;
- source and public type exports with no published `declare module '*.tsrx'`;
- README with an installation section near the start containing copy-paste
  `npm install @octanejs/<name> ...` and `pnpm add @octanejs/<name> ...`
  commands. Include every non-optional external peer so either command is
  sufficient in an existing Octane application; the package inventory check
  enforces the binding and required-peer closure in both commands. Also include
  `status.json`, tests, and strict authored/public/packed-consumer type programs;
- a committed byte-exact `upstream/` pristine tree pinned by
  `audit/upstream.lock.json` (offline-verified against upstream git blob shas),
  plus `audit/upstream-patches/` divergence patches and `.skip` rationales for
  the adapted suite, with the regenerated `tests/upstream` tree git-ignored;
- registry-sourced evidence, when any, under `upstream-artifact/`, hash-pinned
  by `audit/provenance.json` or the package's verifier;
- `UPSTREAM.md` naming package, version/tag, immutable commit, source boundary,
  adapted/copied paths, excluded React shell, and behavioral oracle;
- the binding's primary MIT `LICENSE`, plus a separately named, byte-exact root
  attribution artifact such as `LICENSE.upstream` when the upstream license is
  different (including Unlicense), with both included in published `files`;
- every applicable upstream notice/attribution;
- website binding catalog/generated status, package inventory, parity-gap/CLI
  data, and a patch changeset for user-facing package behavior.

Use the framework-neutral core as-is. Re-author the React-owned layer with Octane
hooks, refs-as-props, native delegated events, compiler-owned hook slots, and
Octane server APIs. Preserve component callback names. Change only standard text
host “every edit” wiring from `onChange` to `onInput`; keep select, checkbox,
radio, and deliberate native-change behavior.

Never execute upstream repository scripts or paste generated conversions without
review. Port behavior and public types, not incidental React implementation
structure. Any copied/adapted algorithm must remain inside the licensed source
boundary recorded in `UPSTREAM.md` and the retained license.

## Upstream inventory and test crosswalk

First prove what runtime and type suites exist at the pin by inspecting its
workspace, package scripts, fixtures, snapshots, and test configuration. The
preflight manifest stores the immutable Git-tree path, blob hash, size, and
runtime/type kind of every discovered upstream test file before implementation;
the registration inventory must cover that stored set. A discovered zero-case
file, dynamic matrix, loop expansion, or unsupported registrar must fail
preflight rather than silently undercount the suite. Preflight expands every
known count into one stable row per registration and preserves
`estimatedRegistrations`, `dynamicExpansion`, `helperExpansion`, and
`manualReviewReason` in immutable evidence. The npm tarball alone cannot prove
that upstream has no tests. Node test-context subtests (`t.test`) and curried
Vitest conditional registrars such as `it.skipIf(condition)(title, fn)` and
`test.runIf(condition)(title, fn)` are registrations too; the inventory must
retain their actual titles and conditions. Run framework-neutral suites
unchanged against reused cores; port React-owned cases one by one with their
upstream names and source citations.

Run `scripts/scaffold-react-port.mjs` against the pinned source/test inventory.
Keep every upstream test file and registration visible. Classify each as:

- implemented with an upstream-derived or differential test;
- covered by an Octane conformance/identity/type/SSR/browser/package test;
- blocked by a named prerequisite or missing Octane primitive;
- unsupported with a durable rationale;
- inapplicable with a specific public-surface reason.

Do not delete, filter, or mark a case passed because it is difficult to execute.
Cite the upstream path/case and immutable revision in local tests or the
crosswalk. Track unported cases in the crosswalk, never with `.skip`, `todo`, or
expected-failure markers. Never weaken an upstream assertion to make it pass.

Classify every port-authored test as unmodified upstream, adapted upstream,
React/Octane differential, Octane-only divergence/framework contract, or
inapplicable with a reason. A parity claim must either run the same observable
scenario against the pinned React implementation or cite the pinned upstream
case that proves it.

Treat upstream type tests as executable evidence. Run the pristine suite with
its original compiler and pinned React types, then a one-for-one adapted suite
with Octane's compiler. Inventory both at file and assertion-group granularity,
record only allowed transformations, and add negative controls for a missing
file, deleted assertion, removed `@ts-expect-error`, skipped runtime case, stale
fixture, and unexecuted lane.

Register pristine/adapted runtime and type lanes in
`packages/<binding>/audit/react-parity.json`. Every Vitest-backed lane must name
a project from `vitest.config.js`; mixed projects put only parity-owned patterns
in `testExecution.include`, leaving Octane-only conformance tests to the normal
shards. Never create a binding-specific CI job or exclusion variable.

Confirm discovery by running the registered project and observing the expected
files and test count. If Vitest reports no matching project or no test files,
repair `vitest.config.js`, the parity manifest, or the package's include pattern
as appropriate and rerun. Test discovery is implementation work; it cannot be
recorded as blocked, inapplicable, or a reason to return an unfinished port.

## Strict type evidence

Type correctness is five obligations represented by six required evidence
gates. Neither upstream command observation substitutes for the other:

1. Run the pristine upstream type suite with its original compiler and pinned
   React types, then the complete one-for-one adapted suite with Octane types.
   Preserve positive assertions, negative assertions, and every
   `@ts-expect-error`. Both project files must declare `reactPortEvidence.gate`
   and an `upstreamRegistrations` list that exactly matches the pinned immutable
   type inventory. Bind each pinned ID to a compiled assertion group with
   `assertUpstreamRegistration('<registration-id>', () => { ...assertions... })`.
   The assertion group must reference the pristine upstream import or adapted
   binding import and contain a real positive type assertion. Boolean ID maps,
   comments, and unrelated string literals are not mappings.
2. Compile the authored package source directly with `tsrx-tsc --noEmit`. The
   project must directly include every authored `.ts`, `.tsx`, and `.tsrx` file;
   a package import can resolve a declaration condition and hide broken source.
   For every source program use `strict: true`, `skipLibCheck: false`, the Octane
   JSX/compiler settings, and no ambient `declare module '*.tsrx'`.
   Never use plain `tsc` or `tsgo` for a program containing `.tsrx`.
3. Compile a consumer of every concrete public entry and type export, including
   entries expanded from package-export wildcards. Assert exported component
   props, hooks, values, and aliases are neither `any` nor `unknown` (for example
   with `AssertNotAny`), exercise representative valid calls, and retain negative
   controls for invalid props and unsupported exports. The project must contain
   parsed imports from every graph-planned public entry, consume every exported
   symbol directly or through a namespace import, and contain both a positive
   assertion and a real `@ts-expect-error` negative control whose symbol identity
   resolves back to an imported binding. Each exported symbol needs its own
   positive assertion; one assertion for the project cannot stand in for the
   remaining exports. Inspect complete callable signatures, return values, type
   arguments, index values, and nested properties for `any` and `unknown`, not
   only the top-level imported symbol.
   The verifier applies the equivalent of `AssertNotAny` recursively to each
   exported type, but that non-`any` guard does not replace an expected-shape
   assertion. Supported positive styles include `Assert<Equal<...>>` imported
   from `scripts/react-port/type-assertions`, `expectType`, `expectTypeOf`, and a
   non-vacuous `satisfies` after the type
   checker has proved the binding is not `any`/`unknown`. Assertions must be semantically
   constraining: `satisfies unknown`, a bare false `Equal`, a merely name-matched
   local helper, a reflexive comparison, and an assertion group whose only real
   assertion belongs to a different export do not count. Type-alias assertions
   must use the repository-owned helper; both `Assert` and `Equal` are recognized
   by their resolved TypeScript symbol and declaration path, and exactly one side
   of `Equal` must carry public-binding provenance. Trusted third-party
   `expectType` and `expectTypeOf` helpers are likewise recognized by resolved
   symbol identity, not a substring in source text. Comments and
   unrelated failures cannot satisfy package consumption. Every
   `assertUpstreamRegistration` group needs its own real positive assertion. A
   declaration file may describe the public surface, but it never replaces
   direct source compilation.
4. Pack the binding and typecheck the installed authored source with Node
   ambient types. Install the complete packed dependency closure across
   `dependencies`, `optionalDependencies`, `peerDependencies`, internal
   workspace packages, and required external peers. Resolve Octane and the
   compiler from the isolated consumer, never back into the workspace.
5. Run the same strict packed-source check without Node ambient types
   (`types: []`) for browser consumers. Directly include installed authored
   `.tsrx`; imports from those files must pull their `.ts` dependencies into the
   program. Bare browser globals, missing ambient declarations, null/ref generic
   mistakes, implicit component props, and hidden peer-type incompatibilities
   are failures to repair.

Explicitly type public component props, context values, ref generics,
nullability, and renderables (`OctaneNode`, never `React.ReactNode`). Ensure
generated ambient declarations needed by a public entry are reachable from that
entry. Keep `types`/conditional exports truthful: declaration-only routing must
not claim runtime exports that the port does not implement.

The repository packed-consumer guard discovers every published framework
binding that ships `.tsrx` and fails when it has no importable public entry. A
new or upgraded port must not add itself to `packedTsrxSourceExceptions` or any
equivalent allowlist. Existing named debt does not authorize new debt. Any
failure in these lanes is implementation work, not an inapplicable or terminal
disposition.

## Evidence matrix

Record every row as `required`, `passed`, `failed`, `blocked`, or `inapplicable`.
`inapplicable` requires a reason; “not run,” skipped, or missing output is never
`passed`.

Initialize the machine matrix once the node is ready; repeat `--category` for
every applicable behavior:

```bash
pnpm react-port:evidence init --batch <id> --node pkg:<name> \
  --category <thin-core|hooks-store|dom-component|provider-portal|ssr-sensitive|async-suspense|performance-sensitive>
```

Choose categories from the binding's public exports and observable contract,
not implementation details. A hook that installs DOM listeners is
`hooks-store`, not `dom-component`; add `dom-component` only for exported
components. Add `provider-portal` only when the pinned public surface exports a
provider or portal behavior. In particular, `react-hotkeys-hook` does not gain
`provider-portal` merely because it uses context internally.

Run every command-backed gate through the evidence runner. It executes an argv
vector directly without a shell, captures bounded output, records the actual
exit status, and cannot turn a failed command into a pass. Repeat `--gate` when
one authoritative command proves multiple rows; the command runs only once:

```bash
pnpm react-port:evidence run --batch <id> --node pkg:<name> \
  --gate package-tests -- pnpm --dir packages/<binding> test
```

The runner binds each gate to an approved command shape and validates the
referenced package/project semantics before execution. Package tests must run
Vitest, Jest, `node --test`, or the repository parity command and contain at
least one runnable or dynamically registered test. Static discovery rejects
obvious no-op and all-skipped suites, but a normal dynamic registration from a
function callback, local `for...of`, or const-backed `test.each` table is proved
by the machine report instead of rejected for an unknown estimate. The evidence
runner injects a process-level machine reporter into every Vitest or Jest
invocation in the package script and intercepts every external `node --test`
command, including chained and delegated commands. Every planned test-runner
invocation must produce its own invocation record linked to its own runner
report; a lane skipped by `||` or another control-flow path therefore fails
rather than borrowing evidence from a sibling lane. Each report must name an
executed, runnable file inside the binding package and prove a passed result with
zero failures or skips. Those runner-owned collected/executed file identities
are authoritative: never infer Vitest or Jest project ownership from source
imports, and never require a runnable browser or sibling project that the
selected runner project did not collect. The merged machine evidence is also
authoritative for dynamic registration counts.
The repository parity wrapper owns the equivalent checks internally. Console
text cannot manufacture a pass. Version, help, list, and watch modes are
rejected. Skipped, todo, conditional, and expected-failure registrations do not
count. Type
projects require complete expected source roots, `strict: true`,
`skipLibCheck: false`, and matching `reactPortEvidence`; pristine/adapted projects
are bound to the pinned immutable type inventory and assertion groups. The
public-export checker expands wildcard targets, follows ESM/CommonJS re-export
chains, uses the correct source kind, recognizes value, type, asset, side-effect,
and intentionally empty declaration contracts, and defers prepack-generated
conditions to packed-artifact validation. It validates each runtime-capable
condition independently so a declaration condition cannot mask an empty runtime
target. An intentionally empty runtime marker must contain only the explicit
`@octane-public-empty-marker` source marker; a sibling declaration is not an
implicit exemption. The checker also preserves exact and wildcard `null`
exclusions and applies the most-specific export-pattern precedence before
expanding concrete public specifiers.
It rejects `true`, ad hoc `node -e`, unrelated package scripts, incompatible
multi-gate groups, and any other successful command that does not prove the requested row.
The approved shapes are:

- `pnpm --dir packages/<binding> test` for package behavior;
- `node scripts/react-port/public-exports.mjs --package-dir
  packages/<binding>` for repository-owned public export validation;
- `node scripts/react-parity/harness.mjs run-required --manifest
  packages/<binding>/audit/react-parity.json` for behavior-category gates;
- `pnpm exec tsrx-tsc --noEmit -p packages/<binding>/tsconfig.json` for direct
  authored source;
- `pnpm exec tsc --noEmit -p <package-local-pristine-project>` for the
  unmodified upstream suite with its pinned React types;
- `pnpm exec tsrx-tsc --noEmit -p <package-local-adapted-project>` for the
  one-for-one Octane adaptation;
- the same `tsrx-tsc` argv with a package-local public type project, including
  `tests/types/tsconfig.json`, for public types;
- `pnpm packages:pack:check` for both packed-source rows and `package-pack`;
- `pnpm sync` for generated data and `pnpm format:check` for formatting.

Record all five strict type obligations under six dedicated evidence gates. The
pristine and adapted upstream suites are separate observations with different
compilers; they must never share a gate or command. The packed repository gate
proves both installed-source contexts and the package boundary in one run:

```bash
pnpm react-port:evidence run --batch <id> --node pkg:<name> \
  --gate upstream-types-pristine -- pnpm exec tsc --noEmit \
  -p packages/<binding>/typetests/tsconfig.pristine.json
pnpm react-port:evidence run --batch <id> --node pkg:<name> \
  --gate upstream-types-adapted -- pnpm exec tsrx-tsc --noEmit \
  -p packages/<binding>/typetests/tsconfig.adapted.json
pnpm react-port:evidence run --batch <id> --node pkg:<name> \
  --gate authored-source-types -- pnpm exec tsrx-tsc --noEmit \
  -p packages/<binding>/tsconfig.json
pnpm react-port:evidence run --batch <id> --node pkg:<name> \
  --gate public-types -- pnpm exec tsrx-tsc --noEmit \
  -p packages/<binding>/tests/types/tsconfig.json
pnpm react-port:evidence run --batch <id> --node pkg:<name> \
  --gate public-exports -- node scripts/react-port/public-exports.mjs \
  --package-dir packages/<binding>
pnpm react-port:evidence run --batch <id> --node pkg:<name> \
  --gate packed-source-types-node \
  --gate packed-source-types-browser \
  --gate package-pack -- pnpm packages:pack:check
```

The type-project paths may follow the closest binding, but all six gate results
and the compiler semantics above are mandatory. Pristine and adapted programs
must have distinct package-local projects. The pristine project must contain a
`pristine` path/name marker and the adapted project an `adapted` marker so the
runner can bind each compiler to the right evidence. Do not use a shared project
or substitute arbitrary commands for a gate-owned command.

Evidence gates declare whether they are `command` or machine-`automated`.
Command gates accept passed/failed evidence only from `run`; automated gates are
written only by `verify`. Use `record` for a blocked row with both `--reason`
and `--repair`, or for an allowed inapplicable row with `--reason`. It rejects
passed/failed command claims that it did not execute. A skipped, unrun, or
missing-output command is never `passed`.

```bash
pnpm react-port:evidence record --batch <id> --node pkg:<name> \
  --gate <gate-id> --status <status> --artifact <existing-path> \
  --observed <observed-result>
```

Always require:

- package test suite and focused public-export behavior;
- pristine/adapted upstream type parity, direct authored-source typecheck,
  precise public types, and packed Node/browser source typechecks;
- upstream test-registration crosswalk completeness;
- public entrypoint/export and packed-consumer checks;
- durable upstream/license/notice provenance;
- final shipped dependency/source-closure audit;
- formatting plus affected generated catalog/status/package data checks.

Build `registrations.json` from the immutable case registrations already stored
by preflight; preserve every machine-generated `id`, source location, registrar,
and title exactly. Never invent a file-level case or replace the pinned case
set. Implemented/conformance crosswalk rows may cite only package-local files
under `test`, `tests`, `__tests__`, type-test directories, or `audit`; package
metadata such as `package.json` is not behavioral evidence.

React is test-only in a binding. Never ship `react` or `react-dom` through
`dependencies`, `optionalDependencies`, `peerDependencies`, or any reachable
public-export import. The package contract and closure audit reject both roots
and their subpaths even if the dependency graph mentions them.

Add by behavior:

- hooks/stores: subscription identity, bailout, selector, effect ordering,
  cleanup, latest-state, and SSR snapshot behavior;
- DOM components: differential event sequences, controlled/uncontrolled state,
  focus/ref lifecycle, keyed survivor identity, accessibility, and browser tests;
- providers/portals: context identity, nested ownership, error/suspense behavior,
  physical versus logical ancestry, and teardown;
- SSR-sensitive surfaces: server execution exclusions, escaping/output, streaming
  when public, hydration adoption/mismatch repair, and client-only boundaries;
- async/Suspense: deterministic promise, timer, replay, rejection, and cleanup;
- large or performance-sensitive ports: bundle/pack size and targeted runtime,
  SSR, hydration, or compiler performance gates.

Use differential tests for observable equivalence and Octane-only conformance
tests for intentional divergences or identity/effect facts a DOM string cannot
prove. Do not weaken assertions to match a buggy implementation.

## Verification and readiness report

Run the narrow package commands first, then the applicable repository gates:

```bash
pnpm react-port:materialize run --check --package-dir packages/<binding>
pnpm react-port:test
pnpm react-parity:check
pnpm react-parity:test
pnpm packages:pack:check
pnpm bindings:status:check
pnpm packages:inventory:check
pnpm binding-parity:gaps:check
pnpm cli:data:check
pnpm tsrx-decls:check
pnpm typecheck
pnpm format:check
```

Treat every red gate as the start of a diagnose–repair–rerun loop. Fix owning
source, test registration, package metadata, generated inputs, or evidence; do
not merely list the failing command in a progress report. For install-state
failures, use the repository-supported non-interactive CI install mode when it
is safe, inspect lockfile changes before retaining them, and fall back to direct
available repository executables for unaffected gates. Preserve unrelated dirty
files throughout.

For `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, retry the required repository
install exactly as `CI=true pnpm install --frozen-lockfile`. If the planned
package legitimately changes the lockfile, use
`CI=true pnpm install --no-frozen-lockfile`, inspect the resulting lockfile diff,
and retain only entries explained by the port. Do not stop after the initial
interactive-purge error.

For a mixed parity project, run both its local project and the sharded
non-parity complement. Confirm every required parity lane executes rather than
only validating metadata. Run affected core tests and the full root `pnpm test`
after targeted evidence is green. Regenerate derived data from its source
command; never edit generated files directly.

Before verification, write three data files: the registration inventory covering
the immutable preflight test-file inventory, its complete classified crosswalk,
and a closure object. The closure contains expected `runtimeDependencies`,
expected `adaptedSources`, a `sourceLedger`, and `reimplementedDependencies`.
The source ledger covers every source file reachable from public exports with
its package-relative path, exact SHA-256, and `authored` or `adapted` origin; an
adapted entry also names its upstream package. Verification derives actual
runtime imports from the package manifest and reachable public source, hashes
the ledger bytes, and compares both derived sets with the graph and closure
expectations. Use `reimplementedDependencies: []` when there are none. For every
no-copy dependency, add exactly one object with its
`packageName`, nonempty `publicBehaviors`, and independently authored
`localEvidence` paths. Those paths must point to safe local tests or artifacts;
source-derived plans and upstream test copies are not clean-room evidence. Then
run the machine completion gate:

```bash
pnpm react-port:evidence verify --batch <id> --node pkg:<name> \
  --package-dir packages/<binding> --expected-directory packages/<binding> \
  --registrations <registrations.json> --crosswalk <crosswalk.json> \
  --closure <closure.json>
```

This command inspects package shape, exports, Octane singleton dependencies,
status, `UPSTREAM.md`, forbidden ambient `.tsrx` declarations, the complete
upstream crosswalk, and the final licensed graph closure. It also requires every
published/source license and NOTICE SHA-256 captured at preflight to appear as
exact packaged bytes in a root attribution artifact included by `files`. It
alone advances an `implementing` node to `verified`; missing required evidence
leaves the node implementing and exits nonzero.

The final machine/human report must name each command and observed result, link
every required evidence row to a test/artifact, list attribution files and
worktree adoptions, and state `verified` only when all required rows pass. Stop
with local changes and readiness unless the user explicitly authorizes the
separate commit/PR workflow.
