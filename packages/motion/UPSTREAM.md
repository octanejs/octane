# Motion upstream ledger

## Pin

- Package: `motion@12.42.2`
- Repository: `https://github.com/motiondivision/motion.git`
- Release tag: `v12.42.2`
- Annotated tag object: `af50633857b1d58e890a47c03114c3d07dcffd32`
- Commit: `40e8756c63b258c9dd07de9501cb788410eefb02`
- npm tarball SHA-256: `d99821507dace914ef6924e95c25beb2d618438fc925517569dd6b083a4df793`
- License: MIT (retained byte-exact as `LICENSE.upstream`, hash-matched to the lock)
- Pinned bytes: `audit/upstream.lock.json` records each committed `upstream/`
  file's git blob sha in the `packages/framer-motion` subtree at the tag
  commit; `pnpm react-port:materialize run --check --package-dir
  packages/motion` verifies the copy offline. The pin identity is
  `framer-motion@12.42.2`, the member the vendored subtree belongs to;
  `motion@12.42.2` is the re-export wrapper published from the same tag.
- Pristine runner shims: `tests/_pristine-shims/` holds the port-authored
  files that resolve the suite's relative library imports onto the published
  `motion/react` pin. They are overlaid onto a scratch copy of the pinned
  bytes at run time and are not upstream evidence.
- Supported upstream range: exactly `12.42.2`
- React oracle: `react@19.2.7`, `react-dom@19.2.7`, `@types/react@19.2.17`, and `@types/react-dom@19.2.3`

The binding reuses Motion's framework-neutral animation engine and ports a bounded React-facing component and hook surface onto Octane.

## Export crosswalk

| Upstream React surface | Octane surface | Disposition | Evidence |
| --- | --- | --- | --- |
| `motion.<tag>` | `motion.<tag>` | Ported host-component factory | differential render/update case and conformance render/effects suites |
| `AnimatePresence` | `AnimatePresence` | Ported with cleanup-before-detach divergence | `conformance/exit.test.ts` |
| `MotionConfig` | `MotionConfig` | Ported default transition context | `conformance/config.test.ts` |
| `useMotionValue`, `useMotionValueEvent` | same | Ported | curated upstream useMotionValue lane + conformance |
| `useAnimate`, `useScroll`, `useTransform`, `useSpring` | same | Ported bounded forms | corresponding conformance suites |
| framework-neutral exports from `motion` | root re-exports | Reused unchanged | package dependency and typecheck |
| Remaining React components and hooks | not exported | Explicit gaps | `status.json` notes |

## Test-suite disposition

Upstream ships an extensive Jest client suite plus Cypress and embedded type tests under `packages/framer-motion`. The npm tarball does not include those tests; they are taken from the git pin.

This package records `upstreamSuites.runtime/types` as **present** (the pin contains those suites) and provenance as **recorded-unverified** until every pin artifact receives an adapted or supported-exclusion disposition. The pristine oracle now runs the complete pinned `src/value/__tests__` suite — 82 cases across 9 files (motion-value, unwrap-value, use-follow-value, use-motion-template, use-motion-value, use-scroll, use-spring, use-transform, use-velocity) — byte-exact against `motion/react@12.42.2`, with per-hook runner shims in `tests/_pristine-shims/` and a Jest-30 alias-matcher compat setup. Adapted coverage: `use-motion-value` has a one-for-one adapted counterpart; the remaining eight files are executed pristine-only and are open adaptation work tracked here (useMotionTemplate, useVelocity, and useFollowValue are additionally unported exports). The curated evidence set also runs:

- pristine: byte-exact `useMotionValue` Jest cases from the pin, executed with native Jest (`jest-full`) against `motion/react@12.42.2`
- adapted: one-for-one Octane ports of those cases
- repo-authored pristine/adapted type probes with structural assertion inventory
- repo-authored differential host-rendering lane

The remaining upstream React/SSR/Cypress cases are present at the pin but not yet preserved or adapted here. `packages/motion/upstream/` holds the curated pin artifacts (`upstream:verify`).

React materializes styles for an `initial`-only target while the current Octane binding does not. The bounded differential fixture therefore uses `initial={false}` and the package continues to avoid claiming complete React Motion parity. Known incompatibilities are recorded in `audit/react-parity.json` divergences (`motion-exit-cleanup-before-detach`, `motion-bounded-layout-flip`, `motion-bounded-layoutId`, `motion-initial-only-no-style-materialization`, `motion-zero-transform-serialization`).
