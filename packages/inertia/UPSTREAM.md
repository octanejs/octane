# Upstream source

`upstream/` is an unmodified snapshot of `packages/react` from
`inertiajs/inertia` at commit
`68b13b662d7a6ecdd504026ee18733192b0c7d73` (`@inertiajs/react@3.6.1`).

The snapshot is review evidence for the Octane adapter and is excluded from the
published package by the package manifest's `files` list. Update it only when
intentionally moving the pinned Inertia release. File digests are locked by
`upstream/SHA256SUMS`.

## Test-suite disposition

The pinned `@inertiajs/react` package tree under `upstream/` contains source
only — no vendored upstream Vitest/Jest suite lives next to that snapshot. The
Inertia monorepo keeps browser/Playwright coverage outside `packages/react`
(for example `tests/form-helper.spec.ts` at the pin). Those artifacts are not
yet vendored or ported case-by-case, so `upstreamSuites.runtime` is `absent`
and `upstreamSuites.types` is `absent` in `audit/react-parity.json`.

Parity evidence for this foundation therefore uses repo-authored lanes:

| Lane / project | Role |
|---|---|
| `inertia-adapted` (`adapted-octane`, vitest-full) | Cited adapted cases for `usePage` against `upstream/src/usePage.ts` |
| `inertia-differential` | Same fixture through Octane and `@inertiajs/react@3.6.1` |
| `inertia-pristine-types` / `inertia-adapted-types` | Port-authored public-surface type probes |

Ordinary Octane-only conformance stays outside `testExecution`:

| Port-authored artifact | Classification |
|---|---|
| `tests/conformance/exports.test.ts` | Octane-only framework contract — unpaired; asserts adapter namespace vs `@inertiajs/core` identity |
| `tests/conformance/hooks.test.ts` | Octane-only conformance — unpaired; exercise Octane hook wiring against the adapter, not a cited upstream case |
| `tests/conformance/forms-state.test.ts` | Octane-only conformance — unpaired; exercise Octane form/HTTP state contracts, not a cited upstream case |
| `tests/ssr/hooks.server.test.ts` | Octane-only framework contract — unpaired; request-local SSR hook init under Octane's server renderer |

When a later PR ports additional pinned upstream cases (or vendors Playwright
scenarios), extend `audit/react-parity.json` and the dedicated projects; keep
conformance patterns outside parity ownership.
