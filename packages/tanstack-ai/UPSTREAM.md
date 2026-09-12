# Upstream

- Repository: https://github.com/TanStack/ai
- Release tag and package: `@tanstack/ai-react@0.24.1`
- Commit: `0ddaa6cb3c2e948a47dbd19d31c0ad874d176a86`
- Source root: `packages/ai-react/src`
- Test root: `packages/ai-react/tests`
- License: MIT (retained in `LICENSE.upstream`)
- npm tarball SHA-256: `3544abc8e0ef89c5f32601ecbcbc3d62d92648bb046777cf2df9429856ca6c74`

## Source boundary

Every published export at `.`, `./ui`, and `./mcp-apps` is available. The
123 literal export contracts are enumerated in
[`tests/types/published-contract.ts`](./tests/types/published-contract.ts),
with generic and namespace checks in `public-contracts.test-d.tsx`.
The 32 upstream source modules are adapted for Octane; the additional
`src/mcp-app-renderer.tsrx` is authored against the public MCP Apps protocol.
No framework-neutral AI client implementation is copied.

`@tanstack/ai@0.54.0` and `@tanstack/ai-client@0.31.1` remain dependencies.
Markdown uses `@octanejs/markdown` and the upstream remark/rehype plugins.
MCP Apps uses the public `app-bridge` and `message-transport` entry points of
`@modelcontextprotocol/ext-apps@1.7.5` with its neutral SDK dependency.
The host was implemented from the public protocol and type contracts;
`@mcp-ui/client@7.1.1` is an unmodified test oracle. None of its source or tests
is copied. The full source ledger and runtime dependency closure are recorded in `audit/`.
The closure follows runtime imports; the two type-only modules remain in the
full source ledger and strict source/public type checks.

## Upstream suite

All 26 test and helper artifacts at the pin are retained unchanged. Their
23 test files register 235 cases (210 runtime and 25 type registrations).
The pristine runtime lane executes all 235; the adapted lanes execute the
same 235 identities (218 client and 17 SSR), with no exclusions. Every case
maps through `audit/registrations.json` and `audit/crosswalk.json`.

Three MIT test helpers from the sibling `ai-client` package at the same commit
are retained unchanged under `upstream-helpers`, with hashes and provenance in
`audit/upstream-helpers.json`. Their core imports resolve to published packages.
Adapted tests are reproducibly materialized from the immutable source and
reviewable patches in `audit/upstream-patches`.

All 25 original type cases run under TypeScript 7, matching upstream. Octane
adaptations run under strict `tsrx-tsc`. Two negative factory assertions are
separate `satisfies` checks to preserve their diagnostic targets under
TypeScript 5.9; neither assertion is removed. Additional tests cover the public
source types, native events and transport replacement, streamed-chat parity,
the real MCP Apps protocol, SSR/hydration, portals, suspension, and teardown.

See `README.md` and `status.json` for the native event, lifecycle, and transport
replacement contracts.
