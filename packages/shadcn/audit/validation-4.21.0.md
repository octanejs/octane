# Shadcn 4.21.0 update validation

Validated on 2026-09-06 from merged main `ac690331b` in an isolated worktree.
This is a scoped registry update, not certification of the entire upstream CLI
or every shadcn family.

- Shadcn client, differential, and SSR projects plus the owned Base UI client
  and SSR projects: 55 files, 553 tests passed.
- Float resource, Float conformance/diagnostic, and Base UI scrollbar resource
  suites: 11 files, 199 tests passed, including development and production
  compilation, SSR, and hydration coverage.
- `tsrx-tsc` checks pass for Shadcn sources, its published-subpath consumer
  program, and Base UI sources. The Octane compiler's `tsgo` check passes.
- Registry and coverage generators are current. Shadcn and Base UI test
  classifications, parity manifests, source hashes, and declared environments
  pass the shared verification helpers.
- The real `shadcn@4.21.0 add` dry run resolves Select, Navigation Menu and Scroll
  Area to three `.tsrx` files with the correct four dependencies. A full external
  install stops at npm because merged `@octanejs/base-ui@0.1.51` has not yet been
  published. Workspace tests exercise the merged source.

## Regressions fixed during integration

Base UI emitted duplicate inline scrollbar style descriptors. A native template
now participates in Float resource hoisting and deduplication. The owning Base
UI test failed before the fix and passes after it.

That exposed an existing compiler defect: the scoped CSS serializer commented
out global resource selectors as unused. Float resources now preserve the
parser's original CSS source. Strengthened client and SSR tests inspect actual
CSSOM declarations; they failed in both development and production before the
fix. Scoped-style controls and resource diagnostics still pass. The change adds
no runtime hot-path work and removes the compiler's unnecessary clone/stylesheet
serialization; no compiler throughput improvement is claimed.

## Class helper bundle cost

Measured with the same local esbuild version, browser platform, ESM output,
minification, and gzip, bundling just the exported helper:

| Helper | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Prior clsx + tailwind-merge wrapper | 27,405 | 8,655 |
| cn 0.2.6 re-export | 25,989 | 10,677 |

The requested upstream migration costs 2,022 additional gzip bytes in this
isolated bundle. This is a bundle-size measurement, not a runtime speed claim.
Existing component behavior and class-override tests pass against the new helper.

No full monorepo test run or real-browser layout audit was performed.
