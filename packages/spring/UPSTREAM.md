# React Spring upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Packages | `@react-spring/web@10.1.2`, `@react-spring/parallax@10.1.2` |
| Supported upstream range | exactly `10.1.2` |
| Canonical repository | `https://github.com/pmndrs/react-spring.git` |
| Tag and commit | `v10.1.2`, `59b1e5306402d3039120e2da464b66e10b1a1aa1` |
| Runtime oracle | React `19.2.7`, ReactDOM `19.2.7` |
| Framework-neutral dependency | `@react-spring/rafz@10.1.2` |
| License | MIT, © Paul Henschel and React Spring contributors |
| Vendored inventory | 167 files, lock-pinned by `audit/upstream.lock.json` |

The npm artifacts contain compiled JavaScript, declarations, README files, and
licenses, but not the canonical TypeScript source or test suites. The
byte-exact source, runtime tests, type tests, package manifests, web target,
Parallax demo, and licenses therefore come from the canonical repository at the
tag commit. They live under `upstream/`, retain the repository layout, are
excluded from the published `files`, and verify offline against the upstream
git blob shas recorded in `audit/upstream.lock.json`. The pinned license is
republished at the package root as `LICENSE.upstream`.

Run `pnpm --dir packages/spring upstream:verify` to detect a modified,
missing, renamed, or unexpected vendored file. The verifier itself has negative
controls in `scripts/react-parity/react-spring-upstream-lib.test.mjs`.

The reusable runtime boundary is deliberately narrow: the port consumes the
exact framework-neutral `@react-spring/rafz` package. Source under upstream
`packages/shared`, `packages/animated`, `packages/core`, `targets/web`, and
`packages/parallax` contains React hooks, contexts, JSX, element types, or
`forwardRef`, so those observable contracts are adapted to Octane. The
`packages/types` tree is the type oracle. Adapted source cites the pinned
release, while the machine-checked test disposition inventory ties every
upstream test file to its executable Octane evidence.

## Runtime export crosswalk

`tests/conformance/exports.test.ts` enforces this inventory in both directions.
“Ported” means the public value exists in the Octane namespace; behavioral and
type evidence is tracked separately and an export is not a release-ready claim
until its cited lanes pass.

| Upstream export | Disposition | Evidence |
|---|---|---|
| `Any` | Ported type sentinel | export inventory and `typetests/public-api.test-d.tsx` |
| `BailSignal` | Ported interruption signal | export inventory and lifecycle conformance |
| `Controller` | Ported | engine, controller, and lifecycle conformance |
| `FrameValue` | Ported public base | animated graph and host conformance |
| `Globals` | Ported global configuration | reduced-motion and browser conformance |
| `Interpolation` | Ported | interpolation and animated graph conformance |
| `Spring` | Ported to Octane render-prop component | `tests/conformance/components.test.ts` |
| `SpringContext` | Ported to Octane context component | `tests/conformance/components.test.ts` |
| `SpringRef` | Ported | `tests/conformance/hooks.test.ts` |
| `SpringValue` | Ported | engine, advanced-engine, lifecycle, and public type lanes |
| `Trail` | Ported to keyed Octane renderables | `tests/conformance/components.test.ts` |
| `Transition` | Ported to keyed Octane renderables | `tests/conformance/components.test.ts` |
| `a` | Ported alias | export inventory and animated-host fixture |
| `animated` | Ported to Octane host components | `tests/conformance/prerequisite-seams.test.ts` |
| `config` | Ported | `tests/conformance/engine.test.ts` |
| `createInterpolator` | Ported | interpolation conformance |
| `easings` | Ported | advanced-engine and export conformance |
| `inferTo` | Ported | export and public type conformance |
| `interpolate` | Ported alias | `tests/conformance/engine.test.ts` |
| `to` | Ported | `tests/conformance/engine.test.ts` |
| `update` | Reused from exact `rafz` | controlled frame-loop conformance |
| `useChain` | Ported to Octane hooks | `tests/conformance/hooks.test.ts` |
| `useInView` | Ported to native observer lifecycle | `tests/conformance/browser-hooks.test.ts` |
| `useIsomorphicLayoutEffect` | Ported to Octane layout effect | SSR, hydration, and browser-hook lanes |
| `useReducedMotion` | Ported to native media-query lifecycle | `tests/conformance/browser-hooks.test.ts` |
| `useResize` | Ported to native observer lifecycle | `tests/conformance/browser-hooks.test.ts` |
| `useScroll` | Ported to native scroll lifecycle | `tests/conformance/browser-hooks.test.ts` |
| `useSpring` | Ported to Octane hooks | `tests/conformance/hooks.test.ts` |
| `useSpringRef` | Ported to Octane hooks | `tests/conformance/hooks.test.ts` |
| `useSpringValue` | Ported to Octane hooks | `tests/conformance/hooks.test.ts` |
| `useSprings` | Ported to Octane hooks | `tests/conformance/hooks.test.ts` |
| `useTrail` | Ported to Octane hooks | `tests/conformance/hooks.test.ts` |
| `useTransition` | Ported with binding-owned keyed retention | `tests/conformance/transitions.test.ts` |
| `Parallax` | Ported at `./parallax` | `tests/conformance/parallax.test.ts` |
| `ParallaxLayer` | Ported at `./parallax` | `tests/conformance/parallax.test.ts` |

`useSpringContext` remains a private helper and is intentionally absent from
the package namespace. Native, Three, Konva, Zdog, and the all-renderer
`react-spring` meta-package are outside this web binding rather than missing web
exports.

## Upstream test-suite disposition

The pinned boundary contains the executable unit/type-test files under
`packages/{animated,core,rafz,shared}` and `targets/web`, plus setup and the
Parallax demo. The vendored files are the authoritative work list.

Runtime identities are inventoried by the pristine Vitest lane and mapped
one-for-one in `audit/upstream-case-dispositions.json` to an adapted identity,
a reused-dependency note, or an explicit `awaiting-adaptation` reason. Negative
controls reject missing/extra pristine identities, adapted title drift, and
skipped adapted cases. Repo-authored conformance/hydration/browser suites stay
in the ordinary shards and are not React-parity ownership.

Type programs under `*.test-d.ts` / `*.test-d.tsx` run pristine via
`audit/type-probes/tsconfig.pristine-upstream.json`. One-for-one adapted type
counterparts live under `typetests/upstream/` and still require Octane public
type-surface work before the adapted-types lane is green.
