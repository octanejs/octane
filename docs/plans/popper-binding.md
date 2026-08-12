# React Popper binding plan

## Objective

Ship `@octanejs/popper` as an exact Octane binding for the published
`react-popper@2.3.0` root contract, without treating the related
`@octanejs/floating-ui` package as API-equivalent.

## Upstream authority

- npm package: `react-popper@2.3.0`
- repository: `floating-ui/react-popper`
- tag: `v2.3.0`
- commit: `b636fa3ceee14245d670a0c438fe4343c31258e5`
- license: MIT, copyright React Popper authors
- runtime exports: `Manager`, `Reference`, `Popper`, `usePopper`
- type exports: `RefHandler`, `PopperArrowProps`, `PopperChildrenProps`,
  `StrictModifier`, `Modifier`, and `PopperProps`
- upstream executable identities: all tests under the pinned tag's four
  `src/*.test.js` suites plus the published TypeScript declaration programs

## Implementation

1. Add a publishable `packages/popper` workspace package with the pinned
   license, provenance, status, package metadata, and public documentation.
2. Implement `usePopper` on `@popperjs/core`, retaining upstream defaults,
   modifier ordering, deep option stability, lifecycle, cleanup, custom
   `createPopper`, styles, attributes, state, update, and force-update behavior.
3. Implement `Manager`, `Reference`, and `Popper` with Octane context and
   ref-as-prop semantics while preserving the upstream render-function contract,
   explicit reference precedence, virtual references, arrow wiring, hide data,
   initial fallbacks, and ref cleanup.
4. Preserve the complete published generic modifier/type surface, adapting only
   React node/ref/style types to Octane/native equivalents where necessary.
5. Integrate the package into workspace dependencies, Vitest projects, React
   parity manifests, package/status/parity inventories, website binding data,
   generated documentation, CLI data, MCP mappings, playground, and changesets.

## Evidence gates

- Vendored pinned source, typings, tests, snapshots, package metadata, and
  license have a fail-closed inventory and checksum verifier.
- A case map accounts for every upstream runtime test identity and published
  declaration program with executable Octane evidence.
- Negative controls prove missing artifacts, missing cases, bad checksums,
  unmapped cases, and stale mappings fail the audit.
- Runtime tests cover all four exports and observable edge cases.
- A differential harness compares the Octane result with pristine React
  `react-popper@2.3.0` using the same deterministic Popper oracle.
- Pristine upstream types and adapted Octane public types compile.
- SSR and hydration tests prove deterministic server rendering, node adoption,
  browser-global safety, and post-hydration positioning/ref behavior.
- Chromium and Firefox exercise real positioning, updates, arrow wiring,
  explicit/virtual references, and cleanup.
- Package tests, global React parity audit, MCP tests, generated-data checks,
  playground production build, package pack inspection, and `git diff --check`
  pass.

## Delivery policy

- One isolated branch and one PR for this binding.
- Open the PR as draft and keep it draft through CI and Cursor/Bugbot feedback.
- Resolve valid automated review findings with tested follow-up commits.
- Only an Octane maintainer marks the PR ready or merges it.
